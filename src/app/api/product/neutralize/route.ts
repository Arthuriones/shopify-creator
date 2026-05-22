import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  neutralizeProductForDestination,
  removeExternalReferencesForDestination,
} from "@/lib/ai/product-neutralizer";
import type { AliExpressProduct } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { product, storeId, customInstructions, mode } = await request.json();
    if (!product || !storeId) {
      return NextResponse.json(
        { error: "Missing product or storeId" },
        { status: 400 }
      );
    }

    const { data: store } = await supabase
      .from("stores")
      .select("id, target_language")
      .eq("id", storeId)
      .eq("user_id", user.id)
      .single();

    if (!store) {
      return NextResponse.json(
        { error: "Loja de destino nao encontrada." },
        { status: 404 }
      );
    }

    const typedProduct = product as AliExpressProduct;
    const sourceImages = Array.isArray(typedProduct.images)
      ? typedProduct.images
          .map((image) => String(image || "").trim())
          .filter(Boolean)
      : [];

    if (sourceImages.length === 0) {
      return NextResponse.json(
        { error: "Produto sem imagens para neutralizar." },
        { status: 400 }
      );
    }

    const cleanupMode =
      mode === "external-references" ? "external-references" : "stock-neutralize";
    const cleanup = {
      userId: user.id,
      title: typedProduct.title,
      descriptionHtml: typedProduct.description,
      images: sourceImages.map((url) => ({ url, altText: typedProduct.title })),
      maxImages: 6,
      targetLanguage: store.target_language || "pt-BR",
      customInstructions:
        typeof customInstructions === "string"
          ? customInstructions.trim().slice(0, 1200)
          : "",
      storageClient: createAdminClient(),
    };

    const neutralized =
      cleanupMode === "external-references"
        ? await removeExternalReferencesForDestination(cleanup)
        : await neutralizeProductForDestination(cleanup);

    const mergedProduct: AliExpressProduct = {
      ...typedProduct,
      title: neutralized.title,
      description: neutralized.descriptionHtml,
      images:
        neutralized.images.length > 0
          ? [
              ...neutralized.images.map((image) => image.src),
              ...typedProduct.images.slice(neutralized.images.length),
            ]
          : typedProduct.images,
    };

    return NextResponse.json({
      product: mergedProduct,
      neutralized,
    });
  } catch (error) {
    console.error("[api/product/neutralize] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao neutralizar produto",
      },
      { status: 500 }
    );
  }
}
