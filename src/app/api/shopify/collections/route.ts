import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicShopifyCollections } from "@/lib/shopify/public-store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lista as colecoes publicas da loja Shopify de origem (para escopar o import).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = request.nextUrl.searchParams.get("source")?.trim() || "";
  if (!source) {
    return NextResponse.json(
      { error: "Informe a loja Shopify de origem." },
      { status: 400 }
    );
  }

  try {
    const { domain, collections } = await fetchPublicShopifyCollections(source);
    return NextResponse.json({ domain, collections });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao ler colecoes da origem.",
      },
      { status: 500 }
    );
  }
}
