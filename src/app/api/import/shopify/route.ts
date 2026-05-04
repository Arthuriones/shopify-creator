import { NextRequest, NextResponse } from "next/server";
import { fetchPublicShopifyProducts } from "@/lib/shopify/public-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source, limit } = await request.json().catch(() => ({}));
  if (!source || typeof source !== "string") {
    return NextResponse.json(
      { error: "source e obrigatorio." },
      { status: 400 }
    );
  }

  try {
    const result = await fetchPublicShopifyProducts(source, { limit });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao importar da Shopify.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
