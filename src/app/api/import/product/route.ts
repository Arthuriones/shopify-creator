import { NextRequest, NextResponse } from "next/server";
import { importFromSource } from "@/lib/import/source-adapters";
import { toAliExpressLikeProduct } from "@/lib/import/publish";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const sourceType =
    body.sourceType === "aliexpress" ||
    body.sourceType === "shopify_public" ||
    body.sourceType === "generic_site"
      ? body.sourceType
      : "auto";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const imported = await importFromSource({
      source: url,
      sourceType,
      limit: 1,
    });
    const product = imported.products[0];

    if (!product) {
      return NextResponse.json(
        { error: "Nao foi possivel extrair um produto desta URL." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product: toAliExpressLikeProduct(product),
      sourceType: imported.sourceType,
      sourceDomain: imported.sourceDomain || null,
      unifiedProduct: product,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import product";
    console.warn("[api.import.product] import failed", {
      url,
      sourceType,
      userId: user.id,
      reason: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
