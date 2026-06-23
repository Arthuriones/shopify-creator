import { fetchWithImportProxy } from "@/lib/import/proxy-fetch";
import {
  normalizePublicShopifyDomain,
  type PublicShopifyProduct,
  type PublicShopifyVariant,
} from "@/lib/shopify/public-store";

// Adapter de Shoplazza via storefront API publica (sem auth):
//   GET /api/product/list?page=N&limit=X  -> { data: { list, has_more, total, ... } }
// O list ja traz variantes com SKU/preco/opcoes e imagens, entao nao precisa
// de request por produto. Normaliza para o mesmo shape PublicShopifyProduct.

interface ShoplazzaImage {
  src?: string;
  alt?: string;
}

interface ShoplazzaOption {
  name?: string;
  position?: number;
  values?: string[];
}

interface ShoplazzaVariant {
  id?: string;
  title?: string;
  sku?: string;
  price?: string;
  compare_at_price?: string;
  options?: { name?: string; value?: string }[];
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShoplazzaProduct {
  id?: string;
  title?: string;
  handle?: string;
  description?: string;
  brief?: string;
  vendor?: string;
  product_type?: string;
  tags?: unknown;
  price?: string;
  compare_at_price?: string;
  image?: ShoplazzaImage;
  images?: ShoplazzaImage[];
  options?: ShoplazzaOption[];
  variants?: ShoplazzaVariant[];
  has_only_default_variant?: boolean;
  url?: string;
}

function shoplazzaApi(domain: string) {
  return `https://${domain}/api/product/list`;
}

// Ids do Shoplazza sao UUID (string); o shape espera number. Gera um numero
// estavel a partir do UUID (so usado como identificador de origem).
function hashId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function absoluteImage(src: string | undefined, domain: string): string {
  const value = (src || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${domain}/${value.replace(/^\/+/, "")}`;
}

function money(value: string | undefined): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function compareAt(
  compare: string | undefined,
  price: string | undefined
): string | null {
  const c = Number(compare);
  const p = Number(price);
  if (Number.isFinite(c) && Number.isFinite(p) && c > p) return c.toFixed(2);
  return null;
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) =>
        typeof tag === "string"
          ? tag
          : String((tag as { name?: string })?.name || "")
      )
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function variantOptionValues(
  variant: ShoplazzaVariant,
  optionNames: string[]
): string[] {
  const byName = new Map<string, string>();
  for (const pair of variant.options || []) {
    if (pair.name) byName.set(pair.name.toLowerCase(), pair.value || "");
  }
  if (byName.size > 0 && optionNames.length > 0) {
    return optionNames.map((name) => byName.get(name.toLowerCase()) || "Default");
  }
  // Fallback para option1/2/3 quando o array options nao vier.
  return [variant.option1, variant.option2, variant.option3]
    .map((value) => (value || "").trim())
    .filter(Boolean);
}

function toPublicProduct(
  domain: string,
  product: ShoplazzaProduct
): PublicShopifyProduct | null {
  const rawId = String(product.id || "").trim();
  const title = (product.title || "").trim();
  const handle = (product.handle || "").trim();
  if (!rawId || !title || !handle) return null;

  const images = (product.images && product.images.length > 0
    ? product.images
    : product.image
      ? [product.image]
      : []
  )
    .map((image) => ({ src: absoluteImage(image.src, domain), altText: image.alt || title }))
    .filter((image) => /^https:\/\//i.test(image.src));

  const optionNames = (product.options || [])
    .map((option) => (option.name || "").trim())
    .filter((name) => name && name !== "Title");

  const sourceVariants = product.variants || [];
  const hasRealVariants =
    !product.has_only_default_variant && sourceVariants.length > 0;

  let variants: PublicShopifyVariant[];
  if (hasRealVariants) {
    variants = sourceVariants.map((variant) => {
      const optionValues = variantOptionValues(variant, optionNames);
      return {
        id: hashId(String(variant.id || `${rawId}-${variant.sku || ""}`)),
        title: variant.title || optionValues.join(" / ") || "Default Title",
        sku: variant.sku?.trim() || null,
        price: money(variant.price || product.price),
        compareAtPrice: compareAt(
          variant.compare_at_price || product.compare_at_price,
          variant.price || product.price
        ),
        optionValues,
      } satisfies PublicShopifyVariant;
    });
  } else {
    const first = sourceVariants[0];
    variants = [
      {
        id: hashId(rawId),
        title: "Default Title",
        sku: first?.sku?.trim() || null,
        price: money(first?.price || product.price),
        compareAtPrice: compareAt(
          first?.compare_at_price || product.compare_at_price,
          first?.price || product.price
        ),
        optionValues: [],
      },
    ];
  }

  const descriptionRaw = (product.description || product.brief || "").trim();
  const descriptionHtml = descriptionRaw
    ? /<[a-z][\s\S]*>/i.test(descriptionRaw)
      ? descriptionRaw
      : `<p>${descriptionRaw}</p>`
    : `<p>${title}</p>`;

  return {
    id: hashId(rawId),
    title,
    handle,
    descriptionHtml,
    vendor: product.vendor?.trim() || null,
    productType: product.product_type?.trim() || null,
    tags: normalizeTags(product.tags),
    options: variants.length > 1 ? optionNames : [],
    images,
    variants,
    sourceUrl:
      product.url && product.url.startsWith("http")
        ? product.url
        : `https://${domain}/products/${handle}`,
  };
}

async function fetchListPage(
  domain: string,
  page: number,
  limit: number
): Promise<{ products: ShoplazzaProduct[]; hasMore: boolean } | null> {
  const url = `${shoplazzaApi(domain)}?page=${page}&limit=${limit}`;
  const res = await fetchWithImportProxy(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const list = data?.data?.list;
  if (!Array.isArray(list)) return null;
  return { products: list as ShoplazzaProduct[], hasMore: Boolean(data.data.has_more) };
}

// Detecta se o link e uma loja Shoplazza (storefront API responde JSON).
export async function isShoplazzaStore(source: string): Promise<boolean> {
  const domain = normalizePublicShopifyDomain(source);
  if (!domain) return false;
  try {
    const page = await fetchListPage(domain, 1, 1);
    return Boolean(page);
  } catch {
    return false;
  }
}

export async function fetchShoplazzaProducts(
  source: string,
  options?: { limit?: number; maxPages?: number; page?: number; pageSize?: number }
): Promise<{ domain: string; products: PublicShopifyProduct[] }> {
  const domain = normalizePublicShopifyDomain(source);
  if (!domain) {
    throw new Error("Informe um dominio Shoplazza valido.");
  }

  const limit = Math.min(Math.max(Math.floor(options?.limit || 250), 1), 5000);
  const singlePage = options?.page ? Math.max(Math.floor(options.page), 1) : null;
  const pageSize = Math.min(
    Math.max(Math.floor(options?.pageSize || (singlePage ? limit : 50)), 1),
    100
  );
  const maxPages = singlePage
    ? 1
    : Math.min(
        Math.max(Math.floor(options?.maxPages || Math.ceil(limit / pageSize)), 1),
        200
      );

  const products: PublicShopifyProduct[] = [];
  for (let offset = 0; offset < maxPages && products.length < limit; offset += 1) {
    const page = singlePage || offset + 1;
    const result = await fetchListPage(domain, page, pageSize);
    if (!result) {
      if (page === 1) {
        throw new Error("Nao foi possivel ler produtos da loja Shoplazza.");
      }
      break;
    }
    for (const raw of result.products) {
      const normalized = toPublicProduct(domain, raw);
      if (normalized) products.push(normalized);
      if (products.length >= limit) break;
    }
    if (!result.hasMore) break;
  }

  return { domain, products };
}
