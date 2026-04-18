import { NextRequest, NextResponse } from "next/server";
import { optimizeProduct } from "@/lib/gemini/client";
import { createClient } from "@/lib/supabase/server";
import { getStoreContext } from "@/lib/store-context";
import type { AliExpressProduct } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { product, storeId } = (await request.json()) as {
    product: AliExpressProduct;
    storeId: string;
  };

  if (!product || !storeId) {
    return NextResponse.json(
      { error: "product and storeId are required" },
      { status: 400 }
    );
  }

  const context = await getStoreContext(storeId, user.id);
  if (!context) {
    return NextResponse.json(
      { error: "Configure o perfil da loja antes de otimizar (nicho obrigatório)" },
      { status: 400 }
    );
  }

  try {
    const result = await optimizeProduct(product, context);
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Optimization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
