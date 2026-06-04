import { NextRequest, NextResponse } from "next/server";
import { buildShopifyTaxonomyEnrichment } from "@/lib/products/shopify-taxonomy-enrichment";
import {
  getProductById,
  getProducts,
  updateProductTaxonomy,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";
import type { StoreContext } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface StoreCredentials {
  id: string;
  user_id: string;
  name: string;
  shop_domain: string;
  client_id: string;
  client_secret: string;
  niche: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  store_description: string | null;
  target_language?: string | null;
}

interface CatalogProductForTaxonomy {
  id: string;
  title: string;
  descriptionHtml?: string;
  tags?: string[];
  productType?: string | null;
  category?: { id?: string; name?: string; fullName?: string } | null;
  options?: { name: string; values: string[] }[];
  variants?: {
    nodes?: {
      title?: string;
      selectedOptions?: { name: string; value: string }[];
    }[];
  };
}

async function getAuthenticated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

function toStoreContext(store: StoreCredentials): StoreContext | null {
  if (!store.niche) return null;

  return {
    name: store.name,
    niche: store.niche,
    targetAudience: store.target_audience || "",
    brandVoice: store.brand_voice || "",
    storeDescription: store.store_description || "",
    targetLanguage: store.target_language || "pt-BR",
  };
}

function variantOptionAttributes(product: CatalogProductForTaxonomy) {
  const variants = product.variants?.nodes || [];
  const byName = new Map<string, Set<string>>();

  for (const variant of variants) {
    for (const option of variant.selectedOptions || []) {
      if (!option.name || !option.value || option.value === "Default Title") continue;
      const values = byName.get(option.name) || new Set<string>();
      values.add(option.value);
      byName.set(option.name, values);
    }
  }

  return Array.from(byName, ([name, values]) => ({
    name,
    value: Array.from(values).join(", "),
  }));
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthenticated();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const productIds: string[] = Array.isArray(body.productIds)
    ? body.productIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const search = typeof body.search === "string" ? body.search.trim() : "";
  const useAiFallback = body.useAiFallback === true;
  const includeAlreadyCategorized = body.includeAlreadyCategorized === true;
  const limit = Math.min(Math.max(Number(body.limit || productIds.length || 50), 1), 50);

  if (!storeId) {
    return NextResponse.json({ error: "storeId e obrigatorio." }, { status: 400 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select(
      "id, user_id, name, shop_domain, client_id, client_secret, niche, target_audience, brand_voice, store_description, target_language"
    )
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();

  if (!store) {
    return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
  }

  const storeCredentials = store as StoreCredentials;
  const creds: ShopifyCredentials = {
    shopDomain: storeCredentials.shop_domain,
    clientId: storeCredentials.client_id,
    clientSecret: storeCredentials.client_secret,
  };
  const context = toStoreContext(storeCredentials);

  try {
    const products = productIds.length
      ? (
          await Promise.all(
            productIds.slice(0, limit).map((id) => getProductById(creds, id).catch(() => null))
          )
        ).filter((product): product is CatalogProductForTaxonomy => Boolean(product))
      : (((await getProducts(creds, {
          first: limit,
          status: "ACTIVE",
          query: search,
        })).products?.nodes || []) as CatalogProductForTaxonomy[]);

    const summary = {
      requested: products.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      products: [] as {
        id: string;
        title: string;
        status: "updated" | "skipped" | "failed";
        category?: string | null;
        source?: string;
        warning?: string;
      }[],
    };

    for (const product of products.slice(0, limit)) {
      if (product.category?.id && !includeAlreadyCategorized) {
        summary.skipped += 1;
        summary.products.push({
          id: product.id,
          title: product.title,
          status: "skipped",
          category: product.category.fullName || product.category.name || null,
          warning: "Produto ja tinha categoria.",
        });
        continue;
      }

      try {
        const taxonomy = await buildShopifyTaxonomyEnrichment({
          creds,
          product: {
            title: product.title,
            descriptionHtml: product.descriptionHtml,
            tags: product.tags || [],
            productType: product.productType,
            sourceCategory: product.category?.fullName || product.productType || null,
            sourceAttributes: variantOptionAttributes(product),
            options: product.options || [],
            variants: product.variants?.nodes?.map((variant) => ({
              title: variant.title,
              selectedOptions: variant.selectedOptions,
            })),
          },
          context,
          enabled: true,
          useAiFallback,
        });

        if (!taxonomy.category?.id && taxonomy.metafields.length === 0) {
          summary.skipped += 1;
          summary.products.push({
            id: product.id,
            title: product.title,
            status: "skipped",
            category: null,
            source: taxonomy.source,
            warning: taxonomy.warnings[0] || "Sem categoria ou atributo confiavel.",
          });
          continue;
        }

        await updateProductTaxonomy(creds, {
          productId: product.id,
          categoryId: taxonomy.category?.id || null,
          productType: taxonomy.productType || product.productType || null,
          metafields: taxonomy.metafields,
        });

        summary.updated += 1;
        summary.products.push({
          id: product.id,
          title: product.title,
          status: "updated",
          category: taxonomy.category?.fullName || taxonomy.categorySearch || null,
          source: taxonomy.source,
          warning: taxonomy.warnings[0],
        });
      } catch (error) {
        summary.failed += 1;
        summary.products.push({
          id: product.id,
          title: product.title,
          status: "failed",
          warning:
            error instanceof Error
              ? error.message
              : "Falha ao enriquecer produto.",
        });
      }
    }

    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao aplicar categorias.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
