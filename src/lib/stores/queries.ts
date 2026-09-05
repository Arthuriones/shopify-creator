import "server-only";
import { createClient } from "@/lib/supabase/server";
import { deriveStoreRoles, type StoreRole } from "@/lib/checkout-routes/store-roles";

const CAMPOS =
  "id, name, shop_domain, theme_id, logo_path, target_language, currency_code, auto_convert_prices, currency_rate, price_markup_percent, created_at";

export interface StoreRow {
  id: string;
  name: string;
  shop_domain: string;
  theme_id: string | null;
  logo_path: string | null;
  target_language: string | null;
  currency_code: string | null;
  auto_convert_prices: boolean | null;
  currency_rate: number | null;
  price_markup_percent: number | null;
  created_at: string;
  role: StoreRole;
}

/**
 * Lojas do usuario, com o papel de cada uma no roteamento ja resolvido.
 *
 * Roda no servidor de proposito. Antes a pagina baixava um componente de 1500
 * linhas, autenticava no Supabase pelo navegador, buscava as lojas e SO ENTAO
 * chamava /api/checkout-routes/map para descobrir quem era vitrine e quem era
 * checkout -- quatro idas e voltas em serie antes de aparecer qualquer coisa
 * na tela. Aqui e uma consulta so, ao lado do banco, e o HTML ja sai pronto.
 */
export async function getStoresWithRoles(): Promise<StoreRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [lojas, rotas] = await Promise.all([
    supabase.from("stores").select(CAMPOS).order("created_at", { ascending: false }),
    supabase
      .from("routed_checkout_configs")
      .select("id, source_store_id, target_store_id")
      .eq("user_id", user.id),
  ]);

  const linhas = lojas.data || [];
  const configs = rotas.data || [];

  let destinos: { route_id: string; target_store_id: string }[] = [];
  if (configs.length > 0) {
    const { data } = await supabase
      .from("routed_checkout_targets")
      .select("route_id, target_store_id")
      .in(
        "route_id",
        configs.map((c) => c.id)
      );
    destinos = data || [];
  }

  const porRota = new Map<string, string[]>();
  for (const destino of destinos) {
    const lista = porRota.get(destino.route_id) || [];
    lista.push(destino.target_store_id);
    porRota.set(destino.route_id, lista);
  }

  const papeis = deriveStoreRoles(
    configs.map((config) => ({
      sourceStoreId: config.source_store_id,
      // Rota anterior a migracao 025 sem linha de destino cai no destino
      // legado da propria rota, senao a loja apareceria como "sem rota".
      targetStoreIds: porRota.get(config.id) || [config.target_store_id].filter(Boolean),
    }))
  );

  return linhas.map((loja) => ({
    ...loja,
    role: papeis.get(loja.id) || "unassigned",
  })) as StoreRow[];
}
