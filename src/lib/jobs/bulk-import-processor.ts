import { importFromSource, productSummary } from "@/lib/import/source-adapters";
import { publishImportedProduct } from "@/lib/import/publish";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreContext } from "@/types";

interface BulkImportProgress {
  source?: string;
  sourceType?: "auto" | "aliexpress" | "shopify_public" | "generic_site";
  step?: string;
  optimize?: boolean;
  customPrompt?: string;
  neutralize?: boolean;
  removeExternalReferences?: boolean;
  aiMediaLimit?: number;
  genericizeText?: boolean;
  neutralizationInstructions?: string;
  applyLogo?: boolean;
  translateVariantOptions?: boolean;
  enrichShopifyTaxonomy?: boolean;
  useAiTaxonomyFallback?: boolean;
  publishToStorefront?: boolean;
  perSourceLimit?: number;
  inventoryMode?: "not_tracked" | "tracked";
  inventoryQuantity?: number;
  current?: number;
  total?: number;
  product?: unknown;
}

interface PendingJob {
  id: string;
  user_id: string;
  store_id: string;
  progress: BulkImportProgress;
}

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

async function updateJob(
  jobId: string,
  payload: {
    status?: "pending" | "processing" | "completed" | "failed";
    progress?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    error?: string | null;
  }
) {
  const supabase = createAdminClient();
  await supabase.from("background_jobs").update(payload).eq("id", jobId);
}

export async function processBulkImportJobs(input: {
  userId?: string;
  storeId?: string;
  limit?: number;
}) {
  const supabase = createAdminClient();
  const limit = Math.min(Math.max(Number(input.limit || 3), 1), 10);

  let query = supabase
    .from("background_jobs")
    .select("id, user_id, store_id, progress")
    .eq("type", "bulk_import")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (input.userId) query = query.eq("user_id", input.userId);
  if (input.storeId) query = query.eq("store_id", input.storeId);

  const { data: jobs, error } = await query;
  if (error) {
    throw new Error(`Nao foi possivel buscar jobs pendentes: ${error.message}`);
  }

  const pendingJobs = (jobs || []) as PendingJob[];
  const summary = {
    processed: 0,
    completed: 0,
    failed: 0,
    products: 0,
  };

  for (const job of pendingJobs) {
    const progress = job.progress || {};
    const source = String(progress.source || "");
    const optimize = progress.optimize === true;
    const customPrompt = String(progress.customPrompt || "").trim();
    const neutralize = progress.neutralize === true;
    const removeExternalReferences = progress.removeExternalReferences === true;
    const aiMediaLimit = Math.min(
      Math.max(Math.floor(Number(progress.aiMediaLimit || 1)), 1),
      20
    );
    const genericizeText = progress.genericizeText !== false;
    const neutralizationInstructions = String(
      progress.neutralizationInstructions || ""
    ).trim();
    const applyLogo = progress.applyLogo === true;
    const translateVariantOptions = progress.translateVariantOptions === true;
    const enrichShopifyTaxonomy = progress.enrichShopifyTaxonomy === true;
    const useAiTaxonomyFallback = progress.useAiTaxonomyFallback === true;
    const publishToStorefront = progress.publishToStorefront !== false;
    const inventoryMode = progress.inventoryMode === "tracked" ? "tracked" : "not_tracked";
    const inventoryQuantityRaw = Number(progress.inventoryQuantity ?? 0);
    const inventoryQuantity =
      inventoryMode === "tracked" && Number.isFinite(inventoryQuantityRaw)
        ? Math.max(0, Math.floor(inventoryQuantityRaw))
        : undefined;
    const inventory = {
      tracked: inventoryMode === "tracked",
      quantity: inventoryQuantity,
    };
    const perSourceLimit = Math.min(
      Math.max(Number(progress.perSourceLimit || 1), 1),
      250
    );

    try {
      await updateJob(job.id, {
        status: "processing",
        progress: { ...progress, source, step: "Carregando loja" },
      });

      const { data: store, error: storeWithLanguageError } = await supabase
        .from("stores")
        .select(
          "id, user_id, name, shop_domain, client_id, client_secret, niche, target_audience, brand_voice, store_description, target_language"
        )
        .eq("id", job.store_id)
        .eq("user_id", job.user_id)
        .single();

      let resolvedStore = store;
      if (storeWithLanguageError) {
        const { data: fallbackStore } = await supabase
          .from("stores")
          .select(
            "id, user_id, name, shop_domain, client_id, client_secret, niche, target_audience, brand_voice, store_description"
          )
          .eq("id", job.store_id)
          .eq("user_id", job.user_id)
          .single();
        resolvedStore = fallbackStore
          ? { ...fallbackStore, target_language: "pt-BR" }
          : null;
      }

      if (!resolvedStore) {
        throw new Error("Loja de destino nao encontrada.");
      }

      const storeCredentials = resolvedStore as StoreCredentials;
      const context = toStoreContext(storeCredentials);

      await updateJob(job.id, {
        status: "processing",
        progress: { ...progress, source, step: "Importando origem" },
      });

      const imported = await importFromSource({
        source,
        sourceType: progress.sourceType || "auto",
        limit: perSourceLimit,
      });

      const publishedProducts = [];
      for (const [index, product] of imported.products.entries()) {
        await updateJob(job.id, {
          status: "processing",
          progress: {
            ...progress,
            source,
            step: neutralize
              ? "Neutralizando e publicando"
              : removeExternalReferences
                ? "Retirando referencias externas e publicando"
              : applyLogo
                ? "Aplicando logo e publicando"
                : optimize
                  ? "Traduzindo e publicando"
                  : "Publicando",
            current: index + 1,
            total: imported.products.length,
            product: productSummary(product),
          },
        });

        const published = await publishImportedProduct({
          creds: {
            shopDomain: storeCredentials.shop_domain,
            clientId: storeCredentials.client_id,
            clientSecret: storeCredentials.client_secret,
          },
          product,
          context,
          optimize,
          customPrompt,
          neutralize,
          removeExternalReferences,
          aiMediaLimit,
          genericizeText,
          neutralizationInstructions,
          applyLogo,
          translateVariantOptions,
          enrichShopifyTaxonomy,
          useAiTaxonomyFallback,
          publishToStorefront,
          inventory,
          userId: job.user_id,
          storeId: job.store_id,
          storageClient: supabase,
        });

        publishedProducts.push({
          title: published.optimized.title,
          sourceUrl: product.sourceUrl,
          shopifyProductId:
            published.result?.productCreate?.product?.id ||
            published.result?.syncedProduct?.id ||
            null,
          publication: published.result?.storefrontPublication || null,
          neutralized: published.neutralized,
          logoAppliedCount: published.logoAppliedCount,
          taxonomy: published.taxonomy
            ? {
                category: published.taxonomy.category || null,
                source: published.taxonomy.source,
                attributes: published.taxonomy.attributes,
              }
            : null,
          warnings: published.warnings,
        });
      }

      summary.completed += 1;
      summary.products += imported.products.length;
      await updateJob(job.id, {
        status: "completed",
        progress: {
          ...progress,
          source,
          step: "Finalizado",
          total: imported.products.length,
        },
        result: {
          sourceType: imported.sourceType,
          sourceDomain: imported.sourceDomain || null,
          products: publishedProducts,
          neutralizedCount: publishedProducts.filter((product) => product.neutralized)
            .length,
          logoAppliedCount: publishedProducts.reduce(
            (total, product) => total + Number(product.logoAppliedCount || 0),
            0
          ),
        },
        error: null,
      });
    } catch (error) {
      summary.failed += 1;
      await updateJob(job.id, {
        status: "failed",
        progress: { ...progress, source, step: "Falhou" },
        error:
          error instanceof Error
            ? error.message
            : "Falha ao processar origem.",
      });
    } finally {
      summary.processed += 1;
    }
  }

  return summary;
}
