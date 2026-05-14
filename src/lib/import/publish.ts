import { optimizeProduct } from "@/lib/gemini/client";
import { neutralizeProductForDestination } from "@/lib/ai/product-neutralizer";
import { applyLogoToProductImages } from "@/lib/images/apply-logo";
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

export function toAliExpressLikeProduct(
  product: UnifiedImportProduct
): AliExpressProduct {
  return {
    title: product.title,
    original_url: product.sourceUrl,
    description: product.descriptionHtml,
    price: Number(product.price || 0),
    originalPrice: Number(product.compareAtPrice || product.price || 0),
    images: product.images.map((image) => image.src),
    specs: {},
    rating: 0,
    orders: 0,
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
  shouldOptimize: boolean
) {
  if (!shouldOptimize || !context || !process.env.GEMINI_API_KEY) {
    return fallbackOptimization(product);
  }

  return optimizeProduct(toAliExpressLikeProduct(product), context);
}

export function toCreateProductInput(input: {
  product: UnifiedImportProduct;
  optimized: OptimizationResult;
  publishToStorefront: boolean;
  inventory?: { tracked: boolean; quantity?: number };
  translateVariantOptions?: boolean;
}) {
  const { product, optimized, publishToStorefront } = input;
  const inventory = input.inventory || { tracked: false };
  const hasOptions = product.options.length > 0 && product.variants.length > 1;

  const createInput = {
    title: optimized.title || product.title,
    descriptionHtml: optimized.description || product.descriptionHtml || "<p></p>",
    tags: optimized.tags?.length ? optimized.tags : product.tags,
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
  neutralize?: boolean;
  neutralizationInstructions?: string;
  applyLogo?: boolean;
  userId?: string;
  storeId?: string;
  storageClient?: SupabaseClient;
}) {
  let product = input.product;
  let optimized = await maybeOptimizeImportedProduct(
    input.product,
    input.context,
    input.optimize
  );
  const warnings: string[] = [];
  let neutralized = false;
  let logoAppliedCount = 0;

  if (input.neutralize) {
    if (!input.userId || !input.storageClient) {
      warnings.push("Neutralizacao ignorada: usuario ou storage ausente.");
    } else {
      const neutralizedProduct = await neutralizeProductForDestination({
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
        maxImages: 3,
        storageClient: input.storageClient,
        targetLanguage: input.context?.targetLanguage || "pt-BR",
        customInstructions: input.neutralizationInstructions,
      });

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
          images: neutralizedProduct.images,
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

  const result = await createProduct(
    input.creds,
    toCreateProductInput({
      product,
      optimized,
      publishToStorefront: input.publishToStorefront,
      inventory: input.inventory,
      translateVariantOptions: input.translateVariantOptions,
    })
  );

  return { optimized, result, warnings, neutralized, logoAppliedCount };
}
