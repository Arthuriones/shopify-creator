import { NextRequest, NextResponse } from "next/server";
import { createProduct, getProducts, type ShopifyCredentials } from "@/lib/shopify/client";
import { optimizeProduct } from "@/lib/gemini/client";
import {
  type PublicShopifyProduct,
  fetchPublicShopifyProducts,
  productsToCsv,
  toShopifyCreateProductInput,
} from "@/lib/shopify/public-store";
import { createClient } from "@/lib/supabase/server";
import type { StoreContext } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type CloneAction = "preview" | "export-json" | "export-csv" | "apply";
type DuplicatePolicy = "skip" | "create";

interface SyncedVariant {
  id: string;
  sku?: string | null;
  selectedOptions?: { name: string; value: string }[];
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
  const { data: store, error } = await supabase
    .from("stores")
    .select("name, shop_domain, client_id, client_secret, niche, target_audience, brand_voice, store_description, target_language")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  if (error) {
    const { data: fallbackStore } = await supabase
      .from("stores")
      .select("name, shop_domain, client_id, client_secret, niche, target_audience, brand_voice, store_description")
      .eq("id", storeId)
      .eq("user_id", userId)
      .single();

    return fallbackStore ? { ...fallbackStore, target_language: "pt-BR" } : null;
  }

  return store;
}

function toStoreContext(store: {
  name?: string | null;
  niche?: string | null;
  target_audience?: string | null;
  brand_voice?: string | null;
  store_description?: string | null;
  target_language?: string | null;
}): StoreContext | null {
  if (!store.niche) return null;
  return {
    name: store.name || "Loja",
    niche: store.niche,
    targetAudience: store.target_audience || "",
    brandVoice: store.brand_voice || "",
    storeDescription: store.store_description || "",
    targetLanguage: store.target_language || "pt-BR",
  };
}

async function buildCreateInputForTarget(
  product: PublicShopifyProduct,
  context: StoreContext | null,
  publishToStorefront: boolean,
  translateProduct: boolean
) {
  const input = {
    ...toShopifyCreateProductInput(product),
    publishToStorefront,
  };

  if (!translateProduct || !context || !process.env.GEMINI_API_KEY) return input;

  const optimized = await optimizeProduct(
    {
      title: product.title,
      original_url: product.sourceUrl,
      description: product.descriptionHtml,
      price: Number(product.variants[0]?.price || 0),
      originalPrice: Number(
        product.variants[0]?.compareAtPrice || product.variants[0]?.price || 0
      ),
      images: product.images.map((image) => image.src),
      specs: {
        vendor: product.vendor || "",
        productType: product.productType || "",
      },
      rating: 0,
      orders: 0,
      variantOptions: product.options.map((option) => ({
        name: option,
        values: [
          ...new Set(
            product.variants
              .flatMap((variant) => variant.optionValues)
              .filter(Boolean)
          ),
        ].map((name) => ({ name })),
      })),
      variants: product.variants.map((variant) => ({
        sku: variant.sku || String(variant.id),
        properties: Object.fromEntries(
          product.options.map((option, index) => [
            option,
            variant.optionValues[index] || "",
          ])
        ),
        price: Number(variant.price || 0),
        originalPrice: Number(variant.compareAtPrice || variant.price || 0),
        stock: 0,
      })),
    },
    context
  );

  return {
    ...input,
    title: optimized.title,
    descriptionHtml: optimized.description,
    tags: optimized.tags,
    seo: {
      title: optimized.seoTitle,
      description: optimized.seoDescription,
    },
  };
}

function variantSignature(optionValues: string[]) {
  return optionValues.join(" / ").toLowerCase();
}

function buildVariantMaps(
  sourceProduct: PublicShopifyProduct,
  syncedProduct: { variants?: { nodes?: SyncedVariant[] } } | null | undefined
) {
  const targetVariants = syncedProduct?.variants?.nodes || [];
  const bySignature = new Map(
    targetVariants.map((variant) => [
      variantSignature((variant.selectedOptions || []).map((option) => option.value)),
      variant.id,
    ])
  );
  const byIndex = targetVariants.map((variant) => variant.id);

  const skuMap: Record<string, string> = {};
  const variantMap: Record<string, string> = {};

  sourceProduct.variants.forEach((sourceVariant, index) => {
    const targetId =
      bySignature.get(variantSignature(sourceVariant.optionValues)) || byIndex[index];

    if (!targetId) return;

    variantMap[String(sourceVariant.id)] = targetId;
    variantMap[`gid://shopify/ProductVariant/${sourceVariant.id}`] = targetId;

    if (sourceVariant.sku) {
      skuMap[sourceVariant.sku] = targetId;
    }
  });

  return { skuMap, variantMap };
}

async function findExistingProduct(
  creds: ShopifyCredentials,
  sourceProduct: PublicShopifyProduct
) {
  const queries = [`handle:${sourceProduct.handle}`, sourceProduct.title]
    .map((query) => query.trim())
    .filter(Boolean);

  for (const query of queries) {
    const result = await getProducts(creds, { first: 10, query });
    const nodes = result?.products?.nodes || [];
    const exact = nodes.find(
      (product: { handle?: string; title?: string }) =>
        product.handle === sourceProduct.handle || product.title === sourceProduct.title
    );
    if (exact) return exact;
  }

  return null;
}

async function recordCloneRun(input: {
  userId: string;
  sourceDomain: string;
  targetStoreId?: string | null;
  action: CloneAction;
  status: "completed" | "failed";
  productCount: number;
  result?: Record<string, unknown>;
  error?: string;
}) {
  const supabase = await createClient();
  await supabase.from("clone_runs").insert({
    user_id: input.userId,
    source_domain: input.sourceDomain,
    target_store_id: input.targetStoreId || null,
    action: input.action,
    status: input.status,
    product_count: input.productCount,
    result: input.result || {},
    error: input.error || null,
  });
}

async function insertRoutingConfig(input: {
  userId: string;
  sourceStoreId: string;
  targetStoreId: string;
  name: string;
  skuMap: Record<string, string>;
  variantMap: Record<string, string>;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routed_checkout_configs")
    .insert({
      user_id: input.userId,
      source_store_id: input.sourceStoreId,
      target_store_id: input.targetStoreId,
      name: input.name,
      mode: "enterprise_static",
      sku_map: input.skuMap,
      variant_map: input.variantMap,
      settings: { generatedBy: "shopify_clone" },
    })
    .select("id, public_token")
    .single();

  if (error) {
    throw new Error("Produtos criados, mas falhou ao criar rota de checkout.");
  }

  return data;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const source = typeof body.source === "string" ? body.source : "";
  const action = (body.action || "preview") as CloneAction;
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const limit = Math.min(Math.max(Number(body.limit || 50), 1), 250);
  const publishToStorefront = body.publishToStorefront !== false;
  const translateProduct =
    body.translateProduct === true || body.translateProducts === true;
  const duplicatePolicy: DuplicatePolicy =
    body.duplicatePolicy === "create" ? "create" : "skip";
  const createRoutingConfig = Boolean(body.createRoutingConfig);

  if (!source) {
    return NextResponse.json(
      { error: "Informe a loja Shopify de origem." },
      { status: 400 }
    );
  }

  if (!["preview", "export-json", "export-csv", "apply"].includes(action)) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  try {
    const { domain, products } = await fetchPublicShopifyProducts(source, {
      limit,
    });

    if (action === "export-csv") {
      await recordCloneRun({
        userId,
        sourceDomain: domain,
        targetStoreId: targetStoreId || null,
        action,
        status: "completed",
        productCount: products.length,
        result: { count: products.length },
      });

      return new NextResponse(productsToCsv(products), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${domain}-products.csv"`,
        },
      });
    }

    if (action === "export-json" || action === "preview") {
      await recordCloneRun({
        userId,
        sourceDomain: domain,
        targetStoreId: targetStoreId || null,
        action,
        status: "completed",
        productCount: products.length,
        result: { count: products.length },
      });

      return NextResponse.json({
        sourceDomain: domain,
        count: products.length,
        products,
      });
    }

    if (!targetStoreId) {
      return NextResponse.json(
        { error: "Selecione a loja de destino." },
        { status: 400 }
      );
    }

    const targetStore = await getStoreCredentials(targetStoreId, userId);
    if (!targetStore) {
      return NextResponse.json(
        { error: "Loja de destino nao encontrada." },
        { status: 404 }
      );
    }

    const targetCreds = {
      shopDomain: targetStore.shop_domain,
      clientId: targetStore.client_id,
      clientSecret: targetStore.client_secret,
    };
    const targetContext = toStoreContext(targetStore);
    const created: { sourceHandle: string; result: unknown }[] = [];
    const skipped: { sourceHandle: string; existingProductId: string }[] = [];
    const failed: { sourceHandle: string; error: string }[] = [];
    const aggregateSkuMap: Record<string, string> = {};
    const aggregateVariantMap: Record<string, string> = {};

    for (const product of products) {
      try {
        if (duplicatePolicy === "skip") {
          const existing = await findExistingProduct(targetCreds, product);
          if (existing?.id) {
            skipped.push({
              sourceHandle: product.handle,
              existingProductId: existing.id,
            });
            const maps = buildVariantMaps(product, existing);
            Object.assign(aggregateSkuMap, maps.skuMap);
            Object.assign(aggregateVariantMap, maps.variantMap);
            continue;
          }
        }

        const result = await createProduct(
          targetCreds,
          await buildCreateInputForTarget(
            product,
            targetContext,
            publishToStorefront,
            translateProduct
          )
        );
        const maps = buildVariantMaps(product, result?.syncedProduct);
        Object.assign(aggregateSkuMap, maps.skuMap);
        Object.assign(aggregateVariantMap, maps.variantMap);
        created.push({ sourceHandle: product.handle, result });
      } catch (error) {
        failed.push({
          sourceHandle: product.handle,
          error:
            error instanceof Error
              ? error.message
              : "Falha ao criar produto.",
        });
      }
    }

    let routingConfig:
      | { id?: string; public_token?: string }
      | null = null;

    if (createRoutingConfig && sourceStoreId && targetStoreId) {
      routingConfig = await insertRoutingConfig({
        userId,
        sourceStoreId,
        targetStoreId,
        name: `Clone ${domain} -> ${targetStore.shop_domain}`,
        skuMap: aggregateSkuMap,
        variantMap: aggregateVariantMap,
      });
    }

    await recordCloneRun({
      userId,
      sourceDomain: domain,
      targetStoreId,
      action,
      status: failed.length === products.length ? "failed" : "completed",
      productCount: products.length,
      result: {
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
        skuMapCount: Object.keys(aggregateSkuMap).length,
        variantMapCount: Object.keys(aggregateVariantMap).length,
        routingConfig,
      },
      error:
        failed.length === products.length
          ? "Todos os produtos falharam ao clonar."
          : undefined,
    });

    return NextResponse.json({
      sourceDomain: domain,
      attempted: products.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      skuMapCount: Object.keys(aggregateSkuMap).length,
      variantMapCount: Object.keys(aggregateVariantMap).length,
      routingConfig,
      created,
      skipped,
      failed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao clonar loja.";
    await recordCloneRun({
      userId,
      sourceDomain: source,
      targetStoreId: targetStoreId || null,
      action,
      status: "failed",
      productCount: 0,
      error: message,
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
