import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";

export interface PickerStore {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  logo_path: string | null;
  currency_code: string;
  auto_convert_prices: boolean;
  currency_rate: number;
  price_markup_percent: number;
}

/**
 * As lojas que alimentam os seletores das telas de importação.
 *
 * Existe porque quatro telas buscavam exatamente isto pelo navegador, DEPOIS
 * de hidratar: baixa o JS, autentica, consulta as lojas e só então tem como
 * pedir os produtos. Quatro passos em série antes de a tela mostrar algo.
 * Buscando no servidor, o primeiro já vem no HTML e a cascata encurta.
 */
export async function getPickerStores(): Promise<PickerStore[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "id, name, shop_domain, niche, logo_path, currency_code, auto_convert_prices, currency_rate, price_markup_percent"
    )
    .order("created_at", { ascending: false });

  return (data || []).map((loja) => ({
    ...loja,
    // Colunas de preço são recentes: loja antiga pode não ter valor, e a tela
    // espera número. Mantém o mesmo padrão que o cliente já aplicava.
    currency_code: loja.currency_code ?? "USD",
    auto_convert_prices: loja.auto_convert_prices ?? false,
    currency_rate: loja.currency_rate ?? 1,
    price_markup_percent: loja.price_markup_percent ?? 0,
  })) as PickerStore[];
}
