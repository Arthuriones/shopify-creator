import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";

export type SetupStepId =
  | "vitrine"
  | "checkout"
  | "produtos"
  | "ligados"
  | "rota"
  | "teste"
  | "ativo";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  description: string;
  done: boolean;
  /** Para onde levar quando este for o passo da vez. */
  href: string;
  cta: string;
}

export interface SetupStatus {
  steps: SetupStep[];
  percent: number;
  /** Primeiro passo ainda aberto. null = operação pronta. */
  next: SetupStep | null;
  nextLabel: string;
  storeCount: number;
  credits: number;
  vitrineName: string | null;
  checkoutNames: string[];
  routeActive: boolean;
}

/**
 * Estado da configuração da operação, derivado do que existe de verdade.
 *
 * Nada aqui é marcado à mão: cada passo é uma pergunta ao banco. Uma lista de
 * passos que o usuário marca sozinho mente na primeira vez que ele desfaz
 * alguma coisa -- apaga a rota e o passo continua verde.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const vazio: SetupStatus = {
    steps: [],
    percent: 0,
    next: null,
    nextLabel: "",
    storeCount: 0,
    credits: 0,
    vitrineName: null,
    checkoutNames: [],
    routeActive: false,
  };
  if (!user) return vazio;

  const [lojas, rotas, perfil] = await Promise.all([
    supabase.from("stores").select("id, name").order("created_at"),
    supabase
      .from("routed_checkout_configs")
      .select("id, name, enabled, sku_map, source_store_id")
      .eq("user_id", user.id),
    supabase.from("profiles").select("ai_credits").eq("id", user.id).single(),
  ]);

  const listaLojas = lojas.data || [];
  const listaRotas = rotas.data || [];
  const rota = listaRotas[0] || null;

  let destinos: { target_store_id: string; enabled: boolean | null; weight: number | null; sku_map: Record<string, unknown> | null }[] = [];
  if (listaRotas.length > 0) {
    const { data } = await supabase
      .from("routed_checkout_targets")
      .select("target_store_id, enabled, weight, sku_map")
      .in(
        "route_id",
        listaRotas.map((r) => r.id)
      );
    destinos = data || [];
  }

  // "routed_ok" é gravado pelo loader quando um carrinho de verdade foi
  // roteado. É o único sinal de que a operação funcionou ponta a ponta.
  let roteouAlgumaVez = false;
  if (rota) {
    const { count } = await supabase
      .from("routed_checkout_fallbacks")
      .select("id", { count: "exact", head: true })
      .eq("route_config_id", rota.id)
      .eq("reason", "routed_ok");
    roteouAlgumaVez = (count ?? 0) > 0;
  }

  const nomePorId = new Map(listaLojas.map((l) => [l.id, l.name]));
  const idsDestino = [...new Set(destinos.map((d) => d.target_store_id))];
  const temMapa = destinos.some((d) => Object.keys(d.sku_map || {}).length > 0);
  const temDestinoAtivo = destinos.some((d) => d.enabled !== false && (d.weight ?? 0) > 0);

  const steps: SetupStep[] = [
    {
      id: "vitrine",
      title: "Conecte sua vitrine",
      description:
        "Recebe o tráfego do anúncio; o comprador navega e monta o carrinho aqui.",
      done: listaLojas.length >= 1,
      href: "/stores",
      cta: "Conectar loja",
    },
    {
      id: "checkout",
      title: "Conecte sua primeira loja de checkout",
      description: "É onde o pagamento acontece, com catálogo neutralizado.",
      done: listaLojas.length >= 2,
      href: "/stores",
      cta: "Conectar loja",
    },
    {
      id: "produtos",
      title: "Leve os produtos para a loja de checkout",
      description: "A loja de checkout precisa do mesmo catálogo, com os mesmos SKUs.",
      done: idsDestino.length > 0,
      href: "/clone/routed-checkout",
      cta: "Criar rota",
    },
    {
      id: "ligados",
      title: "Confira os produtos ligados",
      description: "Cada produto e variante precisa ter par por SKU nas duas lojas.",
      done: temMapa,
      href: "/clone/routed-checkout",
      cta: "Diagnosticar",
    },
    {
      id: "rota",
      title: "Divida o tráfego",
      description: "Escolha quanto de cada comprador vai para cada loja de checkout.",
      done: temDestinoAtivo,
      href: "/clone/routed-checkout",
      cta: "Ajustar divisão",
    },
    {
      id: "teste",
      title: "Teste a operação",
      description: "Monte um carrinho na vitrine e confira em qual checkout ele cai.",
      done: roteouAlgumaVez,
      href: "/clone/routed-checkout",
      cta: "Instalar na vitrine",
    },
    {
      id: "ativo",
      title: "Rota no ar",
      description: "O roteamento passa a valer para os pedidos reais.",
      done: Boolean(rota?.enabled) && temDestinoAtivo && roteouAlgumaVez,
      href: "/clone/routed-checkout",
      cta: "Ver roteamento",
    },
  ];

  const feitos = steps.filter((s) => s.done).length;
  // O primeiro passo ABERTO, não o primeiro depois do último feito: se alguém
  // apaga a rota mas o teste já rodou, o que falta é a rota.
  const next = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    percent: Math.round((feitos / steps.length) * 100),
    next,
    nextLabel: next ? `Próximo: ${next.title.toLowerCase()}` : "Operação pronta",
    storeCount: listaLojas.length,
    credits: perfil.data?.ai_credits ?? 0,
    vitrineName: rota ? nomePorId.get(rota.source_store_id) || null : (listaLojas[0]?.name ?? null),
    checkoutNames: idsDestino.map((id) => nomePorId.get(id) || "loja removida"),
    routeActive: Boolean(rota?.enabled) && temDestinoAtivo,
  };
}
