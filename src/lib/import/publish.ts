import { optimizeProduct } from "@/lib/gemini/client";
import { createProduct, type ShopifyCredentials } from "@/lib/shopify/client";
import type { AliExpressProduct, OptimizationResult, StoreContext } from "@/types";
import type { UnifiedImportProduct } from "./source-adapters";

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
}) {
  const { product, optimized, publishToStorefront } = input;
  const inventory = input.inventory || { tracked: false };
  const hasOptions = product.options.length > 0 && product.variants.length > 1;

  return {
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
}

export async function publishImportedProduct(input: {
  creds: ShopifyCredentials;
  product: UnifiedImportProduct;
  context: StoreContext | null;
  optimize: boolean;
  publishToStorefront: boolean;
  inventory?: { tracked: boolean; quantity?: number };
}) {
  const optimized = await maybeOptimizeImportedProduct(
    input.product,
    input.context,
    input.optimize
  );

  const result = await createProduct(
    input.creds,
    toCreateProductInput({
      product: input.product,
      optimized,
      publishToStorefront: input.publishToStorefront,
      inventory: input.inventory,
    })
  );

  return { optimized, result };
}
