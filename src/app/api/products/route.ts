import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Registra no app um produto que acabou de ser publicado na Shopify.
 *
 * Existe para a tela de produtos nao precisar do cliente Supabase no
 * navegador -- eram 59 KB comprimidos so por causa deste insert e da
 * leitura dos materiais. O RLS continua valendo pela sessao em cookie.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.store_id) {
    return NextResponse.json({ error: "store_id e obrigatorio." }, { status: 400 });
  }

  const { error } = await supabase.from("products").insert({
    store_id: body.store_id,
    aliexpress_url: body.aliexpress_url ?? "",
    shopify_product_id: body.shopify_product_id ?? null,
    title: body.title ?? "",
    original_title: body.original_title ?? "",
    description: body.description ?? "",
    original_description: body.original_description ?? "",
    price: body.price ?? 0,
    images: Array.isArray(body.images) ? body.images : [],
    status: body.status ?? "optimized",
  });

  if (error) {
    return NextResponse.json({ error: "Falha ao registrar o produto." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
