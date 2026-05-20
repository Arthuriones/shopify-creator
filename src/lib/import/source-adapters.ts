import { scrapeProduct } from "@/lib/aliexpress/scraper";
import {
  type PublicShopifyProduct,
  fetchPublicShopifyProducts,
} from "@/lib/shopify/public-store";
import { fetchGenericSiteProducts } from "@/lib/import/generic-site";
import type { AliExpressProduct } from "@/types";

export type ImportSourceType = "aliexpress" | "shopify_public" | "generic_site";

export interface UnifiedImportProduct {
  sourceType: ImportSourceType;
  sourceUrl: string;
  sourceProductId?: string;
  handle?: string;
  title: string;
  descriptionHtml: string;
  price: string;
  compareAtPrice?: string | null;
  images: { src: string; altText: string }[];
  tags: string[];
  options: string[];
  variants: {
    sourceVariantId?: string;
    sku?: string | null;
    title: string;
    price: string;
    compareAtPrice?: string | null;
    optionValues: string[];
  }[];
  raw: unknown;
}

function money(value: number | string | null | undefined): string {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function detectImportSource(input: string): ImportSourceType {
  const lower = input.toLowerCase();
  if (lower.includes("aliexpress.")) return "aliexpress";
  return "shopify_public";
}

export function normalizeAliExpressProduct(
  product: AliExpressProduct,
  sourceUrl: string
): UnifiedImportProduct {
  return {
    sourceType: "aliexpress",
    sourceUrl,
    title: product.title,
    descriptionHtml: /<[a-z][\s\S]*>/i.test(product.description)
      ? product.description
      : `<p>${product.description || ""}</p>`,
    price: money(product.price),
    compareAtPrice: money(product.originalPrice || product.price),
    images: product.images.map((src) => ({ src, altText: product.title })),
    tags: [],
    options: product.variantOptions.map((option) => option.name),
    variants: product.variants.map((variant) => ({
      sourceVariantId: variant.sku,
      sku: variant.sku,
      title: Object.values(variant.properties).join(" / ") || "Default Title",
      price: money(variant.price),
      compareAtPrice: money(variant.originalPrice || variant.price),
      optionValues: Object.values(variant.properties),
    })),
    raw: product,
  };
}

export function normalizePublicShopifyProduct(
  product: PublicShopifyProduct
): UnifiedImportProduct {
  return {
    sourceType: "shopify_public",
    sourceUrl: product.sourceUrl,
    sourceProductId: String(product.id),
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.descriptionHtml || "<p></p>",
    price: product.variants[0]?.price || "0.00",
    compareAtPrice: product.variants[0]?.compareAtPrice || null,
    images: product.images,
    tags: product.tags,
    options: product.options,
    variants: product.variants.map((variant) => ({
      sourceVariantId: String(variant.id),
      sku: variant.sku,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      optionValues: variant.optionValues,
    })),
    raw: product,
  };
}

export async function importFromSource(input: {
  source: string;
  sourceType?: ImportSourceType | "auto";
  limit?: number;
}) {
  const sourceType =
    !input.sourceType || input.sourceType === "auto"
      ? detectImportSource(input.source)
      : input.sourceType;

  if (sourceType === "aliexpress") {
    const product = await scrapeProduct(input.source);
    return {
      sourceType,
      products: [normalizeAliExpressProduct(product, input.source)],
    };
  }

  if (sourceType === "generic_site") {
    const { domain, products } = await fetchGenericSiteProducts(input.source, {
      limit: input.limit || 1,
    });

    return {
      sourceType,
      sourceDomain: domain,
      products,
    };
  }

  try {
    const { domain, products } = await fetchPublicShopifyProducts(input.source, {
      limit: input.limit || 50,
    });

    return {
      sourceType,
      sourceDomain: domain,
      products: products.map(normalizePublicShopifyProduct),
    };
  } catch (error) {
    if (input.sourceType && input.sourceType !== "auto") {
      throw error;
    }

    const { domain, products } = await fetchGenericSiteProducts(input.source, {
      limit: input.limit || 1,
    });

    return {
      sourceType: "generic_site" as const,
      sourceDomain: domain,
      products,
    };
  }
}

export function productSummary(product: UnifiedImportProduct) {
  return {
    title: product.title,
    sourceType: product.sourceType,
    price: product.price,
    images: product.images.length,
    variants: product.variants.length,
    description: stripHtml(product.descriptionHtml).slice(0, 160),
  };
}
