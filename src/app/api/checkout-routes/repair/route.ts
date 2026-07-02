import { NextRequest, NextResponse } from "next/server";
import {
  addProductVariants,
  createProduct,
  getProducts,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import {
  fetchPublicShopifyProducts,
  toShopifyCreateProductInput,
  type PublicShopifyProduct,
} from "@/lib/shopify/public-store";
import { neutralizeProductForDestination } from "@/lib/ai/product-neutralizer";
import {
  enqueueImageNeutralizeJobs,
  requestImageQueueDrain,
} from "@/lib/jobs/image-neutralize-processor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_COST, logAiUsage } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

function numericId(gid: string | number | undefined | null): string | null {
  if (gid === undefined || gid === null) return null;
  const match = String(gid).match(/(\d+)$/);
  return match?.[1] || null;
}

interface TargetVariantInfo {
  variantId: string; // numeric
  productId: string;
  productTitle: string;
  options: string[];
}

async function getAllTargetVariants(creds: ShopifyCredentials) {
  const bySku = new Map<string, TargetVariantInfo>();
  let after: string | null = null;
  for (let page = 0; page < 60; page += 1) {
    const data = await getProducts(creds, { first: 250, after });
    const nodes = data?.products?.nodes || [];
    for (const product of nodes) {
      const options = (product.options || []).map((option: { name: string }) => option.name);
      for (const variant of product.variants?.nodes || []) {
        if (!variant.sku) continue;
        const key = variant.sku.trim().toLowerCase();
        if (!bySku.has(key)) {
          bySku.set(key, {
            variantId: numericId(variant.id) as string,
            productId: product.id,
            productTitle: product.title,
            options,
          });
        }
      }
    }
    const pageInfo = data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }
  return bySku;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const routeId = typeof body.id === "string" ? body.id : "";
  if (!routeId) {
    return NextResponse.json({ error: "Id da rota e obrigatorio." }, { status: 400 });
  }

  const { data: config, error: configError } = await supabase
    .from("routed_checkout_configs")
    .select("id, name, sku_map, variant_map, source_store_id, target_store_id")
    .eq("id", routeId)
    .eq("user_id", user.id)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Rota nao encontrada." }, { status: 404 });
  }

  const { data: stores } = await supabase
    .from("stores")
    .select("id, shop_domain, client_id, client_secret, access_token, niche, target_language")
    .in("id", [config.source_store_id, config.target_store_id]);

  const sourceStore = stores?.find((store) => store.id === config.source_store_id);
  const targetStore = stores?.find((store) => store.id === config.target_store_id);
  if (!sourceStore || !targetStore) {
    return NextResponse.json({ error: "Vitrine ou loja checkout nao encontrada." }, { status: 404 });
  }

  const targetCreds: ShopifyCredentials = {
    shopDomain: targetStore.shop_domain,
    clientId: targetStore.client_id,
    clientSecret: targetStore.client_secret,
    accessToken: targetStore.access_token,
  };

  try {
    const [targetIndex, { products: sourceProducts }] = await Promise.all([
      getAllTargetVariants(targetCreds),
      fetchPublicShopifyProducts(sourceStore.shop_domain, { limit: 5000 }),
    ]);

    const correctSkuMap: Record<string, string> = {};
    const correctVariantMap: Record<string, string> = {};
    let fixedWrongCount = 0;

    function recordCorrect(sku: string, sourceVariantId: number, targetVariantId: string) {
      correctSkuMap[sku] = targetVariantId;
      correctVariantMap[String(sourceVariantId)] = targetVariantId;
      correctVariantMap[`gid://shopify/ProductVariant/${sourceVariantId}`] = targetVariantId;
    }

    const oldSkuMap = (config.sku_map || {}) as Record<string, string | number>;
    const missingByHandle = new Map<string, PublicShopifyProduct>();
    const missingVariantsByHandle = new Map<
      string,
      { variant: PublicShopifyProduct["variants"][number] }[]
    >();

    for (const product of sourceProducts) {
      for (const variant of product.variants) {
        if (!variant.sku) continue;
        const key = variant.sku.trim().toLowerCase();
        const found = targetIndex.get(key);
        if (found) {
          if (String(oldSkuMap[variant.sku] ?? "") !== found.variantId) fixedWrongCount += 1;
          recordCorrect(variant.sku, variant.id, found.variantId);
        } else {
          if (!missingByHandle.has(product.handle)) missingByHandle.set(product.handle, product);
          if (!missingVariantsByHandle.has(product.handle)) {
            missingVariantsByHandle.set(product.handle, []);
          }
          missingVariantsByHandle.get(product.handle)?.push({ variant });
        }
      }
    }

    // Classifica: produto ja existe no destino (algum irmao casou) -> so
    // adiciona as variantes que faltam. Produto nao existe -> cria do zero.
    let extendedCount = 0;
    let createdProductCount = 0;
    let createdVariantCount = 0;
    const imageQueueItems: { productId: string; imageUrl: string; title: string }[] = [];
    const warnings: string[] = [];

    for (const [handle, items] of missingVariantsByHandle) {
      const product = missingByHandle.get(handle);
      if (!product) continue;

      const prefix = product.variants[0]?.sku?.split("-")[0] || "";
      let existingTarget: TargetVariantInfo | null = null;
      for (const [sku, targetVariantId] of Object.entries(correctSkuMap)) {
        if (sku.split("-")[0] === prefix) {
          const info = targetIndex.get(sku.toLowerCase());
          if (info) {
            existingTarget = info;
            break;
          }
          void targetVariantId;
        }
      }

      if (existingTarget) {
        // Estende produto existente
        try {
          const created = await addProductVariants(
            targetCreds,
            existingTarget.productId,
            existingTarget.options,
            items.map(({ variant }) => ({
              price: variant.price,
              sku: variant.sku || undefined,
              optionValues: variant.optionValues,
            }))
          );
          for (let i = 0; i < created.length; i++) {
            const sourceVariant = items[i]?.variant;
            if (sourceVariant?.sku) {
              recordCorrect(sourceVariant.sku, sourceVariant.id, numericId(created[i].id) as string);
            }
          }
          extendedCount += created.length;
        } catch (error) {
          warnings.push(
            `${handle}: falha ao estender produto existente - ${
              error instanceof Error ? error.message : "erro desconhecido"
            }`
          );
        }
        continue;
      }

      // Cria produto novo: neutraliza so o texto (barato, ~$0.003) e usa a
      // imagem original como placeholder -- a fila de imagens troca depois.
      try {
        let title = product.title;
        let descriptionHtml = product.descriptionHtml;
        let tags = product.tags;
        let seoTitle = product.title.slice(0, 70);
        let seoDescription = "";

        // Neutralizacao de texto: best-effort. Se falhar (quota/timeout),
        // usa o titulo original da vitrine e continua -- o produto vai ser
        // criado sem neutralizacao de texto pra nao bloquear o roteamento.
        // A fila de imagens ja vai remover a marca visual.
        if (process.env.GEMINI_API_KEY) {
          try {
            const neutralized = await neutralizeProductForDestination({
              userId: user.id,
              title: product.title,
              descriptionHtml: product.descriptionHtml,
              tags: product.tags,
              seo: { title: product.title, description: "" },
              images: [],
              maxImages: 0,
              targetLanguage: targetStore.target_language || "pt-BR",
              genericizeText: true,
              storageClient: createAdminClient(),
            });
            title = neutralized.title;
            descriptionHtml = neutralized.descriptionHtml;
            tags = neutralized.tags;
            seoTitle = neutralized.seo.title;
            seoDescription = neutralized.seo.description;
            await logAiUsage({
              userId: user.id,
              storeId: targetStore.id,
              action: "neutralize_text",
              costUsd: AI_COST.text,
              metadata: { handle, repair: true },
            });
          } catch (neutralizeError) {
            warnings.push(
              `${handle}: neutralizacao de texto falhou (${
                neutralizeError instanceof Error ? neutralizeError.message : "erro desconhecido"
              }), criando com titulo original.`
            );
          }
        }

        const baseInput = toShopifyCreateProductInput(product);
        const result = await createProduct(targetCreds, {
          ...baseInput,
          title,
          descriptionHtml,
          tags,
          seo: { title: seoTitle, description: seoDescription },
          images: product.images.slice(0, 1),
          variants: product.variants.map((variant) => ({
            price: variant.price,
            compareAtPrice: variant.compareAtPrice || undefined,
            options: variant.optionValues,
            sku: variant.sku || undefined,
          })),
          publishToStorefront: true,
        });

        const syncedVariants = result.syncedProduct?.variants?.nodes || [];
        for (const variant of syncedVariants) {
          const sourceVariant = product.variants.find((v) =>
            v.optionValues.every(
              (value, index) => value === variant.selectedOptions?.[index]?.value
            )
          );
          if (sourceVariant?.sku) {
            recordCorrect(sourceVariant.sku, sourceVariant.id, numericId(variant.id) as string);
            createdVariantCount += 1;
          }
        }
        createdProductCount += 1;

        const heroUrl = product.images[0]?.src;
        const createdProductId = result.syncedProduct?.id;
        if (heroUrl && createdProductId) {
          imageQueueItems.push({ productId: createdProductId, imageUrl: heroUrl, title });
        }
      } catch (error) {
        warnings.push(
          `${handle}: falha ao criar produto - ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`
        );
      }
    }

    let imageQueueCount = 0;
    if (imageQueueItems.length > 0) {
      const { queued } = await enqueueImageNeutralizeJobs({
        userId: user.id,
        storeId: targetStore.id,
        items: imageQueueItems.map((item) => ({
          productId: item.productId,
          imageUrl: item.imageUrl,
          title: item.title,
          mode: "stock-neutralize",
          targetLanguage: targetStore.target_language || "pt-BR",
        })),
      });
      imageQueueCount = queued;
      const origin = request.nextUrl.origin;
      const cookie = request.headers.get("cookie") || "";
      await requestImageQueueDrain({ origin, cookie, storeId: targetStore.id });
    }

    // Mantem as entradas corretas que ja existiam e nao precisaram de fix.
    const finalSkuMap = { ...oldSkuMap, ...correctSkuMap };
    const finalVariantMap = { ...(config.variant_map || {}), ...correctVariantMap };

    const adminSupabase = createAdminClient();
    const { error: updateError } = await adminSupabase
      .from("routed_checkout_configs")
      .update({ sku_map: finalSkuMap, variant_map: finalVariantMap, updated_at: new Date().toISOString() })
      .eq("id", routeId);

    if (updateError) {
      return NextResponse.json({ error: "Falha ao salvar a rota corrigida." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      fixedWrongCount,
      extendedCount,
      createdProductCount,
      createdVariantCount,
      imageQueueCount,
      warnings,
      finalMappedCount: Object.keys(finalSkuMap).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao corrigir a rota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
