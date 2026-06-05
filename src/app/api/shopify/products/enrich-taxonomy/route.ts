import { NextRequest, NextResponse } from "next/server";
import { buildShopifyTaxonomyEnrichment } from "@/lib/products/shopify-taxonomy-enrichment";
import {
  ensureProductMetafieldDefinitions,
  getProductsByIds,
  getProducts,
  updateProductTaxonomy,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";
import type { StoreContext } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const TAXONOMY_APPLY_CONCURRENCY = 6;
const TAXONOMY_PREVIEW_CONCURRENCY = 6;

interface StoreCredentials {
  id: string;
  user_id: string;
  name: string;
  shop_domain: string;
  client_id: string;
  client_secret: string;
  access_token?: string | null;
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
  images?: { nodes?: { url?: string | null; altText?: string | null }[] };
  options?: { name: string; values: string[] }[];
  variants?: {
    nodes?: {
      title?: string;
      selectedOptions?: { name: string; value: string }[];
    }[];
  };
}

interface TaxonomyProposalInput {
  productId?: string;
  title?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  currentCategoryId?: string | null;
  productType?: string | null;
  currentProductType?: string | null;
  metafields?: {
    namespace: string;
    key: string;
    type: string;
    value: string;
    label?: string;
    displayValue?: string;
    definitionTemplateId?: string;
  }[];
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

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
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
  const mode = body.mode === "apply" ? "apply" : "preview";
  const proposals: TaxonomyProposalInput[] = Array.isArray(body.proposals)
    ? body.proposals
    : [];
  const useAiFallback = body.useAiFallback === true;
  const includeAlreadyCategorized = body.includeAlreadyCategorized === true;
  const limit = Math.min(Math.max(Number(body.limit || productIds.length || 50), 1), 50);

  if (!storeId) {
    return NextResponse.json({ error: "storeId e obrigatorio." }, { status: 400 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("*")
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
    accessToken: storeCredentials.access_token,
  };
  const context = toStoreContext(storeCredentials);

  try {
    if (mode === "apply" && proposals.length > 0) {
      const summary = {
        requested: proposals.length,
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

      const proposalsToApply = proposals.slice(0, limit);
      const batchedMetafields = proposalsToApply.flatMap((proposal) =>
        Array.isArray(proposal.metafields)
          ? proposal.metafields.filter(
              (field) => field.namespace && field.key && field.type && field.value
            )
          : []
      );
      if (batchedMetafields.length > 0) {
        const definitionWarnings = await ensureProductMetafieldDefinitions(
          creds,
          batchedMetafields
        );
        if (definitionWarnings.length > 0) {
          console.warn("[shopify.taxonomy.apply] metafield definition warnings", {
            storeId,
            warnings: definitionWarnings.slice(0, 5),
          });
        }
      }

      const applyResults = await runWithConcurrency(
        proposalsToApply,
        TAXONOMY_APPLY_CONCURRENCY,
        async (proposal) => {
        const productId = String(proposal.productId || "");
        if (!productId) {
          return { status: "skipped" as const };
        }

        const metafields = Array.isArray(proposal.metafields)
          ? proposal.metafields.filter(
              (field) => field.namespace && field.key && field.type && field.value
            )
          : [];
        const categoryId =
          proposal.categoryId && proposal.categoryId !== proposal.currentCategoryId
            ? proposal.categoryId
            : null;
        const productType =
          proposal.productType && proposal.productType !== proposal.currentProductType
            ? proposal.productType
            : null;

        if (!categoryId && !productType && metafields.length === 0) {
          return {
            status: "skipped" as const,
            item: {
              id: productId,
              title: proposal.title || productId,
              status: "skipped" as const,
              category: proposal.categoryName || null,
              warning: "Sem alteracoes para aplicar.",
            },
          };
        }

        try {
          const result = await updateProductTaxonomy(creds, {
            productId,
            categoryId,
            productType,
            metafields,
          }) as { metafieldsWarning?: string | null };

          if (result.metafieldsWarning) {
            console.warn("[shopify.taxonomy.apply] partial success", {
              storeId,
              productId,
              title: proposal.title || productId,
              warning: result.metafieldsWarning,
            });
          }

          return {
            status: "updated" as const,
            item: {
              id: productId,
              title: proposal.title || productId,
              status: "updated" as const,
              category: proposal.categoryName || null,
              warning: result.metafieldsWarning || undefined,
            },
          };
        } catch (error) {
          const warning =
            error instanceof Error
              ? error.message
              : "Falha ao aplicar categoria/metacampos.";
          console.error("[shopify.taxonomy.apply] failed", {
            storeId,
            productId,
            title: proposal.title || productId,
            categoryId,
            productType,
            metafieldsCount: metafields.length,
            warning,
          });
          return {
            status: "failed" as const,
            item: {
              id: productId,
              title: proposal.title || productId,
              status: "failed" as const,
              category: proposal.categoryName || null,
              warning,
            },
          };
        }
        }
      );

      for (const result of applyResults) {
        if (result.status === "updated") summary.updated += 1;
        if (result.status === "skipped") summary.skipped += 1;
        if (result.status === "failed") summary.failed += 1;
        if (result.item) summary.products.push(result.item);
      }

      return NextResponse.json({ summary });
    }

    const products = productIds.length
      ? ((await getProductsByIds(
          creds,
          productIds.slice(0, limit)
        )) as CatalogProductForTaxonomy[])
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
      mode,
      products: [] as {
        id: string;
        title: string;
        status: "preview" | "updated" | "skipped" | "failed";
        category?: string | null;
        categoryId?: string | null;
        currentCategoryId?: string | null;
        currentCategory?: string | null;
        productType?: string | null;
        currentProductType?: string | null;
        attributes?: { name: string; key: string; value: string | string[] }[];
        metafields?: {
          namespace: string;
          key: string;
          type: string;
          value: string;
          label?: string;
          displayValue?: string;
          definitionTemplateId?: string;
        }[];
        source?: string;
        warning?: string;
      }[],
    };

    const forceSingleProductPreview = mode === "preview" && productIds.length === 1;

    const previewResults = await runWithConcurrency(
      products.slice(0, limit),
      TAXONOMY_PREVIEW_CONCURRENCY,
      async (product) => {
      if (product.category?.id && !includeAlreadyCategorized && !forceSingleProductPreview) {
        return {
          status: "skipped" as const,
          item: {
            id: product.id,
            title: product.title,
            status: "skipped" as const,
            category: product.category.fullName || product.category.name || null,
            currentCategoryId: product.category.id || null,
            currentCategory: product.category.fullName || product.category.name || null,
            currentProductType: product.productType || null,
            warning: "Produto ja tinha categoria.",
          },
        };
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
            images: product.images?.nodes || [],
            options: product.options || [],
            variants: product.variants?.nodes?.map((variant) => ({
              title: variant.title,
              selectedOptions: variant.selectedOptions,
            })),
          },
          context,
          enabled: true,
          useAiFallback,
          preferAiCategory:
            useAiFallback &&
            Boolean(
              product.category?.id ||
                includeAlreadyCategorized ||
                forceSingleProductPreview
            ),
        });

        if (!taxonomy.category?.id && taxonomy.metafields.length === 0) {
          return {
            status: "skipped" as const,
            item: {
              id: product.id,
              title: product.title,
              status: "skipped" as const,
              category: null,
              currentCategoryId: product.category?.id || null,
              currentCategory: product.category?.fullName || product.category?.name || null,
              currentProductType: product.productType || null,
              source: taxonomy.source,
              warning: taxonomy.warnings[0] || "Sem categoria ou atributo confiavel.",
            },
          };
        }

        return {
          status: "updated" as const,
          item: {
            id: product.id,
            title: product.title,
            status: "preview" as const,
            category: taxonomy.category?.fullName || taxonomy.categorySearch || null,
            categoryId: taxonomy.category?.id || null,
            currentCategoryId: product.category?.id || null,
            currentCategory: product.category?.fullName || product.category?.name || null,
            productType: taxonomy.productType || product.productType || null,
            currentProductType: product.productType || null,
            attributes: taxonomy.attributes,
            metafields: taxonomy.metafields,
            source: taxonomy.source,
            warning: taxonomy.warnings[0],
          },
        };
      } catch (error) {
        return {
          status: "failed" as const,
          item: {
            id: product.id,
            title: product.title,
            status: "failed" as const,
            warning:
              error instanceof Error
                ? error.message
                : "Falha ao enriquecer produto.",
          },
        };
      }
      }
    );

    for (const result of previewResults) {
      if (result.status === "updated") summary.updated += 1;
      if (result.status === "skipped") summary.skipped += 1;
      if (result.status === "failed") summary.failed += 1;
      summary.products.push(result.item);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao aplicar categorias.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
