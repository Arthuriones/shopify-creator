import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { optimizeProduct } from "@/lib/gemini/client";
import { getStoreContext } from "@/lib/store-context";

export const maxDuration = 60; // Allow up to 60 seconds for AI processing on Vercel

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { product, storeId } = await request.json();

    if (!product || !storeId) {
      return NextResponse.json({ error: "Missing product or storeId" }, { status: 400 });
    }

    const context = await getStoreContext(storeId, user.id);

    if (!context || !context.niche) {
      return NextResponse.json({ error: "Store context not found or missing niche." }, { status: 400 });
    }

    const optimized = await optimizeProduct(product, context);

    return NextResponse.json({ optimized });
  } catch (error) {
    console.error("Optimize product error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao otimizar produto" },
      { status: 500 }
    );
  }
}
