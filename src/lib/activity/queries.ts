import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";

export type ActivityKind = "ok" | "warn" | "err" | "info";

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  at: string;
  kind: ActivityKind;
  /** Linha crua da origem, para o bloco de detalhes técnicos. */
  tech: string;
}

/** Eventos do loader que valem virar linha na atividade. */
const EVENTO_LOADER: Record<
  string,
  { title: string; kind: ActivityKind; desc: (d: string | null) => string }
> = {
  routed_ok: {
    title: "Carrinho roteado",
    kind: "ok",
    desc: (d) => d || "Um comprador foi levado para a loja de checkout.",
  },
  cart_checkout_error: {
    title: "Falha ao rotear o carrinho",
    kind: "err",
    desc: (d) =>
      d
        ? `O comprador clicou em finalizar e não foi redirecionado: ${d}`
        : "O comprador clicou em finalizar e não foi redirecionado.",
  },
  bypass_form_submit: {
    title: "Checkout escapou do roteamento",
    kind: "warn",
    desc: () => "A vitrine levou o comprador ao próprio checkout, que não cobra.",
  },
  bypass_link: {
    title: "Checkout escapou por link",
    kind: "warn",
    desc: () => "Um link levou direto ao checkout da vitrine.",
  },
};

const ACAO_CLONE: Record<string, string> = {
  apply: "Importação concluída",
  preview: "Prévia de importação",
  "export-json": "Catálogo exportado (JSON)",
  "export-csv": "Catálogo exportado (CSV)",
};

/**
 * A linha do tempo da operação.
 *
 * Não existe tabela de log: cada linha aqui é derivada de algo que já
 * aconteceu e ficou registrado -- loja criada, rota criada, destino
 * adicionado, importação rodada, evento do loader. É menos do que um log
 * dedicado daria, mas é verdade, e não exige gravar nada novo.
 */
export async function getActivity(limite = 40): Promise<ActivityItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const [lojas, rotas, execucoes] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, shop_domain, created_at")
      .order("created_at", { ascending: false })
      .limit(limite),
    supabase
      .from("routed_checkout_configs")
      .select("id, name, enabled, created_at, source_store_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limite),
    supabase
      .from("clone_runs")
      .select("id, source_domain, action, status, product_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limite),
  ]);

  const listaLojas = lojas.data || [];
  const listaRotas = rotas.data || [];
  const nomePorId = new Map(listaLojas.map((l) => [l.id, l.name]));

  // Destinos e eventos do loader dependem dos ids das rotas: saem juntos.
  const idsRota = listaRotas.map((r) => r.id);
  const [destinos, eventos] = await Promise.all([
    idsRota.length
      ? supabase
          .from("routed_checkout_targets")
          .select("id, route_id, target_store_id, created_at")
          .in("route_id", idsRota)
          .order("created_at", { ascending: false })
          .limit(limite)
      : Promise.resolve({ data: null }),
    idsRota.length
      ? supabase
          .from("routed_checkout_fallbacks")
          .select("id, reason, detail, created_at")
          .in("route_config_id", idsRota)
          .order("created_at", { ascending: false })
          .limit(limite)
      : Promise.resolve({ data: null }),
  ]);

  const itens: ActivityItem[] = [];

  for (const loja of listaLojas) {
    itens.push({
      id: `loja-${loja.id}`,
      title: "Loja conectada",
      description: `${loja.name} entrou no xcart.`,
      at: loja.created_at,
      kind: "ok",
      tech: `stores.id=${loja.id} · ${loja.shop_domain}`,
    });
  }

  for (const rota of listaRotas) {
    itens.push({
      id: `rota-${rota.id}`,
      title: "Rota criada",
      description: `${nomePorId.get(rota.source_store_id) || "Uma vitrine"} passou a rotear o checkout.`,
      at: rota.created_at,
      kind: "ok",
      tech: `routed_checkout_configs.id=${rota.id}`,
    });
  }

  for (const destino of (destinos.data || []) as {
    id: string;
    target_store_id: string;
    created_at: string;
  }[]) {
    itens.push({
      id: `destino-${destino.id}`,
      title: "Loja de checkout entrou no rodízio",
      description: `${nomePorId.get(destino.target_store_id) || "Uma loja"} passou a receber comprador.`,
      at: destino.created_at,
      kind: "ok",
      tech: `routed_checkout_targets.id=${destino.id}`,
    });
  }

  for (const execucao of execucoes.data || []) {
    const falhou = execucao.status === "failed";
    itens.push({
      id: `clone-${execucao.id}`,
      title: falhou
        ? "Importação falhou"
        : ACAO_CLONE[execucao.action] || "Importação",
      description: falhou
        ? `A importação de ${execucao.source_domain} não terminou.`
        : `${execucao.product_count} produto(s) de ${execucao.source_domain}.`,
      at: execucao.created_at,
      kind: falhou ? "err" : "ok",
      tech: `clone_runs.action=${execucao.action} status=${execucao.status}`,
    });
  }

  for (const evento of (eventos.data || []) as {
    id: string;
    reason: string;
    detail: string | null;
    created_at: string;
  }[]) {
    const mapa = EVENTO_LOADER[evento.reason];
    // "loader_ready" dispara em toda visita: viraria ruído e afogaria o resto.
    if (!mapa) continue;
    itens.push({
      id: `evento-${evento.id}`,
      title: mapa.title,
      description: mapa.desc(evento.detail),
      at: evento.created_at,
      kind: mapa.kind,
      tech: `routed_checkout_fallbacks.reason=${evento.reason}`,
    });
  }

  return itens
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limite);
}
