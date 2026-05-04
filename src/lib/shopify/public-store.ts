import { normalizeShopDomain } from "@/lib/shopify/domain";

export interface PublicShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  optionValues: string[];
}

export interface PublicShopifyProduct {
  id: number;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  options: string[];
  images: { src: string; altText: string }[];
  variants: PublicShopifyVariant[];
  sourceUrl: string;
}

interface ProductsJsonImage {
  src?: string;
  alt?: string | null;
}

interface ProductsJsonOption {
  name?: string;
}

interface ProductsJsonVariant {
  id?: number;
  title?: string;
  sku?: string | null;
  price?: string | number;
  compare_at_price?: string | number | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

interface ProductsJsonProduct {
  id?: number;
  title?: string;
  handle?: string;
  body_html?: string;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string | string[];
  options?: ProductsJsonOption[];
  images?: ProductsJsonImage[];
  variants?: ProductsJsonVariant[];
}

function normalizeTags(tags: string | string[] | undefined): string[] {
  if (Array.isArray(tags)) return tags.map((tag) => tag.trim()).filter(Boolean);
  return (tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeMoney(value: string | number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : "0.00";
}

function productUrl(domain: string, handle: string): string {
  return `https://${domain}/products/${handle}`;
}

function toPublicProduct(
  domain: string,
  product: ProductsJsonProduct
): PublicShopifyProduct | null {
  const id = Number(product.id);
  const title = (product.title || "").trim();
  const handle = (product.handle || "").trim();

  if (!Number.isFinite(id) || !title || !handle) return null;

  const options =
    product.options
      ?.map((option) => option.name?.trim())
      .filter((name): name is string => Boolean(name && name !== "Title")) || [];

  const images =
    product.images
      ?.map((image) => ({
        src: image.src || "",
        altText: image.alt || title,
      }))
      .filter((image) => /^https:\/\//i.test(image.src)) || [];

  const variants =
    product.variants
      ?.map((variant) => {
        const variantId = Number(variant.id);
        if (!Number.isFinite(variantId)) return null;

        return {
          id: variantId,
          title: variant.title || "Default Title",
          sku: variant.sku || null,
          price: normalizeMoney(variant.price),
          compareAtPrice: variant.compare_at_price
            ? normalizeMoney(variant.compare_at_price)
            : null,
          optionValues: [variant.option1, variant.option2, variant.option3]
            .map((value) => (value || "").trim())
            .filter((value) => value && value !== "Default Title"),
        };
      })
      .filter((variant): variant is PublicShopifyVariant => Boolean(variant)) || [];

  return {
    id,
    title,
    handle,
    descriptionHtml: product.body_html || "",
    vendor: product.vendor || null,
    productType: product.product_type || null,
    tags: normalizeTags(product.tags),
    options,
    images,
    variants:
      variants.length > 0
        ? variants
        : [
            {
              id,
              title: "Default Title",
              sku: null,
              price: "0.00",
              compareAtPrice: null,
              optionValues: [],
            },
          ],
    sourceUrl: productUrl(domain, handle),
  };
}

export function normalizePublicShopifyDomain(input: string): string | null {
  return normalizeShopDomain(input);
}

export async function fetchPublicShopifyProducts(
  source: string,
  options?: { limit?: number; maxPages?: number }
): Promise<{ domain: string; products: PublicShopifyProduct[] }> {
  const domain = normalizePublicShopifyDomain(source);
  if (!domain) {
    throw new Error("Informe um dominio Shopify valido.");
  }

  const limit = Math.min(Math.max(Math.floor(options?.limit || 250), 1), 1000);
  const maxPages = Math.min(Math.max(Math.floor(options?.maxPages || 4), 1), 20);
  const products: PublicShopifyProduct[] = [];

  for (let page = 1; page <= maxPages && products.length < limit; page += 1) {
    const url = `https://${domain}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "ShopifyCreator/1.0 (+https://shopify.dev)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      if (page === 1) {
        throw new Error(
          `Nao foi possivel ler produtos publicos da loja (${res.status}).`
        );
      }
      break;
    }

    const data = (await res.json()) as { products?: ProductsJsonProduct[] };
    const pageProducts = Array.isArray(data.products) ? data.products : [];
    if (pageProducts.length === 0) break;

    for (const product of pageProducts) {
      const normalized = toPublicProduct(domain, product);
      if (normalized) products.push(normalized);
      if (products.length >= limit) break;
    }
  }

  return { domain, products };
}

export function toShopifyCreateProductInput(product: PublicShopifyProduct) {
  return {
    title: product.title,
    descriptionHtml: product.descriptionHtml || "<p></p>",
    tags: product.tags,
    images: product.images.slice(0, 20),
    options: product.options.length > 0 ? product.options : undefined,
    variants: product.variants.slice(0, 100).map((variant) => ({
      price: variant.price,
      compareAtPrice: variant.compareAtPrice || undefined,
      options: variant.optionValues,
    })),
    seo: {
      title: product.title.slice(0, 70),
      description: product.descriptionHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
    },
  };
}

export function productsToCsv(products: PublicShopifyProduct[]): string {
  const header = [
    "Handle",
    "Title",
    "Body (HTML)",
    "Vendor",
    "Type",
    "Tags",
    "Variant SKU",
    "Variant Price",
    "Variant Compare At Price",
    "Image Src",
  ];

  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = products.flatMap((product) => {
    const firstImage = product.images[0]?.src || "";
    return product.variants.map((variant) => [
      product.handle,
      product.title,
      product.descriptionHtml,
      product.vendor || "",
      product.productType || "",
      product.tags.join(", "),
      variant.sku || "",
      variant.price,
      variant.compareAtPrice || "",
      firstImage,
    ]);
  });

  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
