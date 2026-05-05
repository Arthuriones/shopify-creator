import { NextRequest, NextResponse } from "next/server";
import {
  createProduct,
  getProducts,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ConnectedVariant {
  id: string;
  title: string;
  sku?: string | null;
  price?: string;
  compareAtPrice?: string | null;
  selectedOptions?: { name: string; value: string }[];
}

interface ConnectedProduct {
  id: string;
  title: string;
  handle: string;
  status?: string;
  descriptionHtml?: string;
  tags?: string[];
  seo?: { title?: string; description?: string };
  images?: { nodes?: { url: string; altText?: string | null }[] };
  options?: { name: string; values?: string[] }[];
  variants?: { nodes?: ConnectedVariant[] };
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
}

async function getStoreCredentials(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, client_id, client_secret")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  return store;
}

function variantSignature(variant: ConnectedVariant) {
  return (variant.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean)
    .join(" / ")
    .toLowerCase();
}

function buildVariantMaps(
  sourceProduct: ConnectedProduct,
  targetProduct: { variants?: { nodes?: ConnectedVariant[] } } | null | undefined
) {
  const sourceVariants = sourceProduct.variants?.nodes || [];
  const targetVariants = targetProduct?.variants?.nodes || [];
  const targetBySignature = new Map(
    targetVariants.map((variant) => [variantSignature(variant), variant.id])
  );

  const skuMap: Record<string, string> = {};
  const variantMap: Record<string, string> = {};

  sourceVariants.forEach((sourceVariant, index) => {
    const targetId =
      targetBySignature.get(variantSignature(sourceVariant)) ||
      targetVariants[index]?.id;

    if (!targetId) return;

    variantMap[sourceVariant.id] = targetId;
    if (sourceVariant.sku?.trim()) {
      skuMap[sourceVariant.sku.trim()] = targetId;
    }
  });

  return { skuMap, variantMap };
}

function toCreateProductInput(product: ConnectedProduct) {
  const variants = product.variants?.nodes || [];
  const optionNames =
    product.options
      ?.map((option) => option.name)
      .filter((name) => name && name !== "Title") || [];
  const hasOptions = variants.length > 1 && optionNames.length > 0;

  return {
    title: product.title,
    descriptionHtml: product.descriptionHtml || `<p>${product.title}</p>`,
    tags: product.tags || [],
    images:
      product.images?.nodes?.map((image) => ({
        src: image.url,
        altText: image.altText || product.title,
      })) || [],
    options: hasOptions ? optionNames : undefined,
    variants: variants.length
      ? variants.slice(0, 100).map((variant) => ({
          price: String(variant.price || "0.00"),
          compareAtPrice: variant.compareAtPrice
            ? String(variant.compareAtPrice)
            : undefined,
          options: hasOptions
            ? optionNames.map(
                (optionName) =>
                  variant.selectedOptions?.find((option) => option.name === optionName)
                    ?.value || "Default"
              )
            : undefined,
        }))
      : [{ price: "0.00" }],
    seo: {
      title: product.seo?.title || product.title,
      description: product.seo?.description || product.title,
    },
    publishToStorefront: true,
  };
}

async function findExistingProduct(
  creds: ShopifyCredentials,
  sourceProduct: ConnectedProduct
) {
  const queries = [`handle:${sourceProduct.handle}`, sourceProduct.title]
    .map((query) => query.trim())
    .filter(Boolean);

  for (const query of queries) {
    const result = await getProducts(creds, { first: 10, query });
    const nodes = (result?.products?.nodes || []) as ConnectedProduct[];
    const exact = nodes.find(
      (product) =>
        product.handle === sourceProduct.handle ||
        product.title === sourceProduct.title
    );
    if (exact) return exact;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const limit = Math.min(Math.max(Number(body.limit || 50), 1), 100);

  if (!sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "Selecione vitrine e dark store." },
      { status: 400 }
    );
  }

  if (sourceStoreId === targetStoreId) {
    return NextResponse.json(
      { error: "A dark store precisa ser diferente da vitrine." },
      { status: 400 }
    );
  }

  const [sourceStore, targetStore] = await Promise.all([
    getStoreCredentials(sourceStoreId, userId),
    getStoreCredentials(targetStoreId, userId),
  ]);

  if (!sourceStore || !targetStore) {
    return NextResponse.json(
      { error: "Uma das lojas selecionadas nao foi encontrada." },
      { status: 404 }
    );
  }

  const sourceCreds = {
    shopDomain: sourceStore.shop_domain,
    clientId: sourceStore.client_id,
    clientSecret: sourceStore.client_secret,
  };
  const targetCreds = {
    shopDomain: targetStore.shop_domain,
    clientId: targetStore.client_id,
    clientSecret: targetStore.client_secret,
  };

  const sourceData = await getProducts(sourceCreds, { first: limit });
  const sourceProducts = (sourceData?.products?.nodes || []) as ConnectedProduct[];
  const created: { sourceHandle: string; targetProductId?: string }[] = [];
  const skipped: { sourceHandle: string; targetProductId?: string }[] = [];
  const failed: { sourceHandle: string; error: string }[] = [];
  const skuMap: Record<string, string> = {};
  const variantMap: Record<string, string> = {};

  for (const product of sourceProducts) {
    try {
      const existing = await findExistingProduct(targetCreds, product);
      if (existing?.id) {
        const maps = buildVariantMaps(product, existing);
        Object.assign(skuMap, maps.skuMap);
        Object.assign(variantMap, maps.variantMap);
        skipped.push({ sourceHandle: product.handle, targetProductId: existing.id });
        continue;
      }

      const result = await createProduct(targetCreds, toCreateProductInput(product));
      const targetProduct = result?.syncedProduct as
        | { id?: string; variants?: { nodes?: ConnectedVariant[] } }
        | null
        | undefined;
      const maps = buildVariantMaps(product, targetProduct);
      Object.assign(skuMap, maps.skuMap);
      Object.assign(variantMap, maps.variantMap);
      created.push({
        sourceHandle: product.handle,
        targetProductId: targetProduct?.id,
      });
    } catch (error) {
      failed.push({
        sourceHandle: product.handle,
        error: error instanceof Error ? error.message : "Falha ao criar destino.",
      });
    }
  }

  return NextResponse.json({
    attempted: sourceProducts.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    skuMap,
    variantMap,
    created,
    skipped,
    failed,
  });
}
