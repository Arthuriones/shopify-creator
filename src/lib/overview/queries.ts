import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";

export interface OverviewTarget {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  weight: number;
  sharePercent: number;
  mappedCount: number;
  /** "ok" recebe comprador, "paused" está fora, "attention" tem problema. */
  state: "ok" | "paused" | "attention";
}

export interface OverviewIssue {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export interface ActivityEntry {
  id: string;
  reason: string;
  label: string;
  detail: string | null;
  at: string;
  kind: "ok" | "warn" | "err";
}

export interface Overview {
  storeCount: number;
  vitrineCount: number;
  checkoutCount: number;
  chargingCount: number;
  mappedVariants: number;
  issues: OverviewIssue[];
  routeName: string | null;
  routeEnabled: boolean;
  rotationLabel: string;
  vitrineName: string | null;
  targets: OverviewTarget[];
  activity: ActivityEntry[];
}

// Como cada evento do loader aparece na lista de atividade.
const EVENTOS: Record<string, { label: string; kind: ActivityEntry["kind"] }> = {
  routed_ok: { label: "Carrinho roteado", kind: "ok" },
  loader_ready: { label: "Vitrine carregou o script", kind: "ok" },
  cart_checkout_error: { label: "Falha ao rotear o carrinho", kind: "err" },
  bypass_form_submit: { label: "Checkout escapou do roteamento", kind: "warn" },
  bypass_link: { label: "Checkout escapou por link", kind: "warn" },
};

function rotulo(reason: string) {
  return EVENTOS[reason] ?? { label: reason, kind: "warn" as const };
}

export const getOverview = cache(async (): Promise<Overview> => {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);

  const vazio: Overview = {
    storeCount: 0,
    vitrineCount: 0,
    checkoutCount: 0,
    chargingCount: 0,
    mappedVariants: 0,
    issues: [],
    routeName: null,
    routeEnabled: false,
    rotationLabel: "",
    vitrineName: null,
    targets: [],
    activity: [],
  };
  if (!user) return vazio;

  const [lojas, rotas] = await Promise.all([
    supabase.from("stores").select("id, name, shop_domain"),
    supabase
      .from("routed_checkout_configs")
      .select("id, name, enabled, rotation, settings, source_store_id")
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  const listaLojas = lojas.data || [];
  const listaRotas = rotas.data || [];
  const rota = listaRotas[0] || null;
  const porId = new Map(listaLojas.map((l) => [l.id, l]));

  if (!rota) {
    return { ...vazio, storeCount: listaLojas.length };
  }

  // As duas so dependem de rota.id, entao saem juntas. Em serie eram dois
  // arredondamentos ao banco onde um resolve.
  const [{ data: linhasDestino }, { data: eventos }] = await Promise.all([
    supabase
      .from("routed_checkout_targets")
      .select("id, target_store_id, enabled, weight, sku_map, last_healed_at")
      .eq("route_id", rota.id)
      .order("position"),
    supabase
      .from("routed_checkout_fallbacks")
      .select("id, reason, detail, created_at")
      .eq("route_config_id", rota.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const destinos = linhasDestino || [];
  const pesoTotal = destinos
    .filter((d) => d.enabled !== false && (d.weight ?? 0) > 0)
    .reduce((soma, d) => soma + (d.weight ?? 0), 0);

  const targets: OverviewTarget[] = destinos.map((d) => {
    const loja = porId.get(d.target_store_id);
    const mapa = Object.keys(d.sku_map || {}).length;
    const ativo = d.enabled !== false && (d.weight ?? 0) > 0;
    // "Atenção" é destino ligado sem nenhum produto ligado -- mesmo em 0%,
    // porque basta dar fatia para os carrinhos começarem a falhar.
    const problema = d.enabled !== false && mapa === 0;
    return {
      id: d.id,
      name: loja?.name || "loja removida",
      domain: loja?.shop_domain || "",
      enabled: d.enabled !== false,
      weight: d.weight ?? 0,
      sharePercent:
        ativo && pesoTotal > 0 ? Math.round(((d.weight ?? 0) / pesoTotal) * 100) : 0,
      mappedCount: mapa,
      state: problema ? "attention" : ativo ? "ok" : "paused",
    };
  });

  // ---- o que requer ação ----
  const issues: OverviewIssue[] = [];

  const semMapa = targets.filter((t) => t.state === "attention");
  for (const alvo of semMapa) {
    issues.push({
      id: `sem-mapa-${alvo.id}`,
      title: `${alvo.name} está recebendo comprador sem produtos ligados`,
      detail:
        "A loja entra no rodízio mas nenhum produto tem par por SKU. Todo carrinho que cair nela falha.",
      href: "/clone/routed-checkout",
      cta: "Diagnosticar",
    });
  }

  const ultimo = (rota.settings as { last_heal?: { ok: boolean; message?: string } } | null)
    ?.last_heal;
  if (ultimo && !ultimo.ok) {
    issues.push({
      id: "heal",
      title: "A última checagem automática achou um problema",
      detail: ultimo.message || "Rode o diagnóstico da rota para ver o que falta.",
      href: "/clone/routed-checkout",
      cta: "Ver rota",
    });
  }

  const cobrando = targets.filter((t) => t.state === "ok").length;
  if (rota.enabled && cobrando === 0) {
    issues.push({
      id: "ninguem-cobra",
      title: "Nenhuma loja de checkout está recebendo comprador",
      detail:
        "Com a rota ligada assim, o cliente cai no checkout da vitrine, que não cobra.",
      href: "/clone/routed-checkout",
      cta: "Ajustar divisão",
    });
  }

  const falhas = (eventos || []).filter((e) => rotulo(e.reason).kind === "err").length;
  if (falhas > 0) {
    issues.push({
      id: "falhas",
      title: `${falhas} carrinho(s) falharam ao rotear recentemente`,
      detail: "O comprador clicou em finalizar e não foi redirecionado.",
      href: "/clone/routed-checkout",
      cta: "Ver rota",
    });
  }

  const estrategia =
    (rota.rotation as { strategy?: string } | null)?.strategy === "each_checkout"
      ? "sorteia toda vez"
      : "sempre a mesma loja";

  const idsDestino = new Set(destinos.map((d) => d.target_store_id));

  return {
    storeCount: listaLojas.length,
    vitrineCount: new Set(listaRotas.map((r) => r.source_store_id)).size,
    checkoutCount: idsDestino.size,
    chargingCount: cobrando,
    mappedVariants: targets.reduce((soma, t) => Math.max(soma, t.mappedCount), 0),
    issues,
    routeName: rota.name,
    routeEnabled: rota.enabled !== false,
    rotationLabel: estrategia,
    vitrineName: porId.get(rota.source_store_id)?.name || null,
    targets,
    activity: (eventos || []).map((e) => {
      const r = rotulo(e.reason);
      return {
        id: e.id,
        reason: e.reason,
        label: r.label,
        detail: e.detail,
        at: e.created_at,
        kind: r.kind,
      };
    }),
  };
})
