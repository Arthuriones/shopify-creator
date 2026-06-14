import { optimizeProduct } from "@/lib/gemini/client";
import {
  neutralizeProductForDestination,
  removeExternalReferencesForDestination,
} from "@/lib/ai/product-neutralizer";
import { applyLogoToProductImages } from "@/lib/images/apply-logo";
import { buildShopifyTaxonomyEnrichment } from "@/lib/products/shopify-taxonomy-enrichment";
import { translateProductVariantOptionsToPortuguese } from "@/lib/products/variant-translation";
import { createProduct, type ShopifyCredentials } from "@/lib/shopify/client";
import type { AliExpressProduct, OptimizationResult, StoreContext } from "@/types";
import type { UnifiedImportProduct } from "./source-adapters";
import type { SupabaseClient } from "@supabase/supabase-js";

function money(value: string | number | null | undefined): string {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clampAiMediaLimit(value: unknown, fallback = 1) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.floor(numeric), 1), 20);
}

export function toAliExpressLikeProduct(
  product: UnifiedImportProduct
): AliExpressProduct {
  const rawAliExpressProduct =
    product.sourceType === "aliexpress" && product.raw && typeof product.raw === "object"
      ? (product.raw as Partial<AliExpressProduct>)
      : null;

  return {
    title: product.title,
    original_url: product.sourceUrl,
    description: product.descriptionHtml,
    price: Number(product.price || 0),
    originalPrice: Number(product.compareAtPrice || product.price || 0),
    images: product.images.map((image) => image.src),
    specs: Object.fromEntries(
      (product.sourceAttributes || []).map((attribute) => [
        attribute.name,
        attribute.value,
      ])
    ),
    rating: Number(rawAliExpressProduct?.rating || 0),
    orders: Number(rawAliExpressProduct?.orders || 0),
    variantOptions: product.options.map((optionName) => ({
      name: optionName,
      values: [
        ...new Set(
          product.variants
            .flatMap((variant) => variant.optionValues)
            .filter(Boolean)
        ),
      ].map((name) => ({ name })),
    })),
    variants: product.variants.map((variant) => ({
      sku: variant.sku || variant.sourceVariantId || variant.title,
      properties: Object.fromEntries(
        product.options.map((optionName, index) => [
          optionName,
          variant.optionValues[index] || "",
        ])
      ),
      price: Number(variant.price || product.price || 0),
      originalPrice: Number(
        variant.compareAtPrice || variant.price || product.compareAtPrice || product.price || 0
      ),
      stock: 0,
    })),
  };
}

function fallbackOptimization(product: UnifiedImportProduct): OptimizationResult {
  const plainDescription = stripHtml(product.descriptionHtml);
  return {
    title: product.title.slice(0, 70),
    description: product.descriptionHtml || `<p>${product.title}</p>`,
    tags: product.tags.slice(0, 8),
    seoTitle: product.title.slice(0, 60),
    seoDescription: (plainDescription || product.title).slice(0, 155),
  };
}

export async function maybeOptimizeImportedProduct(
  product: UnifiedImportProduct,
  context: StoreContext | null,
  shouldOptimize: boolean,
  customPrompt?: string
) {
  if (!shouldOptimize || !context || !process.env.GEMINI_API_KEY) {
    return fallbackOptimization(product);
  }

  return optimizeProduct(toAliExpressLikeProduct(product), context, customPrompt);
}

export function toCreateProductInput(input: {
  product: UnifiedImportProduct;
  optimized: OptimizationResult;
  publishToStorefront: boolean;
  inventory?: { tracked: boolean; quantity?: number };
  translateVariantOptions?: boolean;
  taxonomy?: Awaited<ReturnType<typeof buildShopifyTaxonomyEnrichment>>;
}) {
  const { product, optimized, publishToStorefront } = input;
  const inventory = input.inventory || { tracked: false };
  const hasOptions = product.options.length > 0 && product.variants.length > 1;

  const createInput = {
    title: optimized.title || product.title,
    descriptionHtml: optimized.description || product.descriptionHtml || "<p></p>",
    tags: optimized.tags?.length ? optimized.tags : product.tags,
    categoryId: input.taxonomy?.category?.id || undefined,
    productType: input.taxonomy?.productType || undefined,
    metafields: input.taxonomy?.metafields || undefined,
    images: product.images.slice(0, 20),
    options: hasOptions ? product.options : undefined,
    variants: product.variants.length
      ? product.variants.slice(0, 100).map((variant) => ({
          price: money(variant.price || product.price),
          compareAtPrice: variant.compareAtPrice
            ? money(variant.compareAtPrice)
            : undefined,
          options: variant.optionValues,
          inventoryTracked: inventory.tracked,
          ...(inventory.tracked && typeof inventory.quantity === "number"
            ? { inventoryQuantity: inventory.quantity }
            : {}),
        }))
      : [
          {
            price: money(product.price),
            compareAtPrice: product.compareAtPrice
              ? money(product.compareAtPrice)
              : undefined,
            inventoryTracked: inventory.tracked,
            ...(inventory.tracked && typeof inventory.quantity === "number"
              ? { inventoryQuantity: inventory.quantity }
              : {}),
          },
        ],
    seo: {
      title: optimized.seoTitle || optimized.title || product.title,
      description:
        optimized.seoDescription ||
        stripHtml(optimized.description || product.descriptionHtml).slice(0, 155),
    },
    publishToStorefront,
  };

  return input.translateVariantOptions
    ? translateProductVariantOptionsToPortuguese(createInput)
    : createInput;
}

export async function publishImportedProduct(input: {
  creds: ShopifyCredentials;
  product: UnifiedImportProduct;
  context: StoreContext | null;
  optimize: boolean;
  publishToStorefront: boolean;
  inventory?: { tracked: boolean; quantity?: number };
  translateVariantOptions?: boolean;
  customPrompt?: string;
  neutralize?: boolean;
  removeExternalReferences?: boolean;
  aiMediaLimit?: number;
  genericizeText?: boolean;
  neutralizationInstructions?: string;
  applyLogo?: boolean;
  enrichShopifyTaxonomy?: boolean;
  useAiTaxonomyFallback?: boolean;
  userId?: string;
  storeId?: string;
  storageClient?: SupabaseClient;
}) {
  let product = input.product;
  let optimized = await maybeOptimizeImportedProduct(
    input.product,
    input.context,
    input.optimize,
    input.customPrompt
  );
  const warnings: string[] = [];
  let neutralized = false;
  let logoAppliedCount = 0;

  if (input.neutralize || input.removeExternalReferences) {
    if (!input.userId || !input.storageClient) {
      warnings.push("Limpeza por IA ignorada: usuario ou storage ausente.");
    } else {
      const cleanupInput = {
        userId: input.userId,
        title: optimized.title,
        descriptionHtml: optimized.description,
        tags: optimized.tags,
        seo: {
          title: optimized.seoTitle,
          description: optimized.seoDescription,
        },
        images: product.images.map((image) => ({
          url: image.src,
          altText: image.altText,
        })),
        maxImages: clampAiMediaLimit(input.aiMediaLimit, 1),
        storageClient: input.storageClient,
        targetLanguage: input.context?.targetLanguage || "pt-BR",
        customInstructions:
          input.neutralizationInstructions || input.customPrompt,
        genericizeText: input.genericizeText !== false,
      };
      const neutralizedProduct = input.removeExternalReferences
        ? await removeExternalReferencesForDestination(cleanupInput)
        : await neutralizeProductForDestination(cleanupInput);

      optimized = {
        title: neutralizedProduct.title,
        description: neutralizedProduct.descriptionHtml,
        tags: neutralizedProduct.tags,
        seoTitle: neutralizedProduct.seo.title,
        seoDescription: neutralizedProduct.seo.description,
      };
      if (neutralizedProduct.images.length > 0) {
        product = {
          ...product,
          images: [
            ...neutralizedProduct.images,
            ...product.images.slice(neutralizedProduct.images.length),
          ],
        };
      }
      warnings.push(...neutralizedProduct.warnings);
      neutralized = true;
    }
  }

  if (input.applyLogo) {
    if (!input.userId || !input.storeId || !input.storageClient) {
      warnings.push("Logo ignorada: loja, usuario ou storage ausente.");
    } else {
      const branded = await applyLogoToProductImages({
        userId: input.userId,
        storeId: input.storeId,
        images: product.images,
        storageClient: input.storageClient,
        maxImages: 20,
      });
      product = {
        ...product,
        images: branded.images,
      };
      logoAppliedCount = branded.appliedCount;
      warnings.push(...branded.warnings);
    }
  }

  const taxonomy = await buildShopifyTaxonomyEnrichment({
    creds: input.creds,
    product,
    context: input.context,
    enabled: input.enrichShopifyTaxonomy === true,
    useAiFallback: input.useAiTaxonomyFallback === true,
  });
  warnings.push(...taxonomy.warnings);

  const result = await createProduct(
    input.creds,
    toCreateProductInput({
      product,
      optimized,
      publishToStorefront: input.publishToStorefront,
      inventory: input.inventory,
      translateVariantOptions: input.translateVariantOptions,
      taxonomy,
    })
  );

  return { optimized, result, warnings, neutralized, logoAppliedCount, taxonomy };
}
