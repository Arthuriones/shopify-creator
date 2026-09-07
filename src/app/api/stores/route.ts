import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CAMPOS =
  "id, name, shop_domain, theme_id, logo_path, target_language, currency_code, auto_convert_prices, currency_rate, price_markup_percent, product_count, variant_count, catalog_synced_at, created_at";

/**
 * Lista as lojas do usuario.
 *
 * A tela de lojas ja recebe a primeira carga do servidor; isto serve para
 * recarregar depois de conectar ou editar, sem precisar do cliente Supabase
 * no navegador.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select(CAMPOS)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Falha ao listar lojas." }, { status: 500 });
  }
  return NextResponse.json({ stores: data || [] });
}
