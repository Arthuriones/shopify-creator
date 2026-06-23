import { fetchWithImportProxy } from "@/lib/import/proxy-fetch";
import {
  normalizePublicShopifyDomain,
  type PublicShopifyProduct,
  type PublicShopifyVariant,
} from "@/lib/shopify/public-store";

// Adapter de WooCommerce via Store API publica (sem auth):
//   GET /wp-json/wc/store/products?per_page=100&page=N
//   GET /wp-json/wc/store/products?type=variation&parent=<id>  (variacoes)
// Normaliza para o mesmo shape PublicShopifyProduct que o import ja consome.

interface WooImage {
  src?: string;
  alt?: string;
}

interface WooPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_minor_unit?: number;
}

interface WooAttribute {
  name?: string;
  has_variations?: boolean;
  terms?: { name?: string }[];
}

interface WooVariationRef {
  id?: number;
  // O produto-pai expoe o combo de atributos de cada variacao de forma estavel.
  attributes?: { name?: string; value?: string }[];
}

interface WooVariationDetail {
  id?: number;
  sku?: string;
  prices?: WooPrices;
}

interface WooProduct {
  id?: number;
  name?: string;
  slug?: string;
  permalink?: string;
  sku?: string;
  type?: string;
  description?: string;
  short_description?: string;
  prices?: WooPrices;
  images?: WooImage[];
  categories?: { name?: string }[];
  attributes?: WooAttribute[];
  variations?: WooVariationRef[];
  has_options?: boolean;
  variation?: { attribute?: string; value?: string }[];
}

function wooApiBase(domain: string) {
  return `https://${domain}/wp-json/wc/store/products`;
}

function priceFromMinor(prices: WooPrices | undefined, key: keyof WooPrices = "price") {
  const raw = prices?.[key];
  const minorUnit = Number(prices?.currency_minor_unit ?? 2);
  const value = Number(raw);
  if (!Number.isFinite(value)) return "0.00";
  const divisor = Math.pow(10, Number.isFinite(minorUnit) ? minorUnit : 2);
  return (value / divisor).toFixed(2);
}

function compareAtFromPrices(prices: WooPrices | undefined): string | null {
  const regular = Number(prices?.regular_price);
  const sale = Number(prices?.sale_price);
  // So tem "de/por" quando ha desconto real.
  if (Number.isFinite(regular) && Number.isFinite(sale) && regular > sale) {
    return priceFromMinor(prices, "regular_price");
  }
  return null;
}

// Detecta se o link e uma loja WooCommerce (Store API responde JSON).
export async function isWooCommerceStore(source: string): Promise<boolean> {
  const domain = normalizePublicShopifyDomain(source);
  if (!domain) return false;
  try {
    const res = await fetchWithImportProxy(
      `${wooApiBase(domain)}?per_page=1`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Array.isArray(data);
  } catch {
    return false;
  }
}

// Detalhe das variacoes (sku + preco) por id, via Store API.
async function fetchVariationDetails(
  domain: string,
  parentId: number
): Promise<Map<number, WooVariationDetail>> {
  const map = new Map<number, WooVariationDetail>();
  try {
    const res = await fetchWithImportProxy(
      `${wooApiBase(domain)}?type=variation&parent=${parentId}&per_page=100`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return map;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return map;
    for (const item of data as WooVariationDetail[]) {
      const id = Number(item.id);
      if (Number.isFinite(id)) map.set(id, item);
    }
  } catch {
    // sem detalhe: o combo ainda vem do produto-pai; sku/preco caem no fallback.
  }
  return map;
}

function optionNames(product: WooProduct): string[] {
  return (product.attributes || [])
    .filter((attribute) => attribute.has_variations && attribute.name)
    .map((attribute) => String(attribute.name));
}

function refOptionValues(
  ref: WooVariationRef,
  options: string[]
): string[] {
  // Combo de atributos do produto-pai: [{ name, value }]. Casa pelo nome; se
  // houver so 1 opcao, usa o unico valor direto.
  const byName = new Map<string, string>();
  for (const pair of ref.attributes || []) {
    if (pair.name) byName.set(pair.name.toLowerCase(), pair.value || "");
  }
  if (options.length === 1 && (ref.attributes || []).length >= 1) {
    return [ref.attributes?.[0]?.value || "Default"];
  }
  return options.map((name) => byName.get(name.toLowerCase()) || "Default");
}

async function toPublicProduct(
  domain: string,
  product: WooProduct
): Promise<PublicShopifyProduct | null> {
  const id = Number(product.id);
  const title = (product.name || "").trim();
  const handle = (product.slug || "").trim();
  if (!Number.isFinite(id) || !title || !handle) return null;

  const images = (product.images || [])
    .map((image) => ({ src: image.src || "", altText: image.alt || title }))
    .filter((image) => /^https:\/\//i.test(image.src));

  const tags = (product.categories || [])
    .map((category) => (category.name || "").trim())
    .filter(Boolean);
  const productType = tags[0] || null;

  const options = optionNames(product);
  let variants: PublicShopifyVariant[] = [];

  const isVariable =
    product.type === "variable" ||
    (product.variations && product.variations.length > 0);

  if (isVariable && options.length > 0 && (product.variations || []).length > 0) {
    const details = await fetchVariationDetails(domain, id);
    variants = (product.variations || [])
      .map((ref) => {
        const variantId = Number(ref.id);
        if (!Number.isFinite(variantId)) return null;
        const optionValues = refOptionValues(ref, options);
        const detail = details.get(variantId);
        return {
          id: variantId,
          title: optionValues.join(" / ") || "Default Title",
          sku: detail?.sku?.trim() || null,
          // Detalhe da variacao tem o preco real; cai no preco do pai se faltar.
          price: priceFromMinor(detail?.prices || product.prices),
          compareAtPrice: compareAtFromPrices(detail?.prices || product.prices),
          optionValues,
        } satisfies PublicShopifyVariant;
      })
      .filter((variant): variant is PublicShopifyVariant => Boolean(variant));
  }

  // Produto simples (ou variavel sem variacoes acessiveis): 1 variante.
  if (variants.length === 0) {
    variants = [
      {
        id,
        title: "Default Title",
        sku: product.sku?.trim() || null,
        price: priceFromMinor(product.prices),
        compareAtPrice: compareAtFromPrices(product.prices),
        optionValues: [],
      },
    ];
  }

  const descriptionHtml =
    product.description || product.short_description || `<p>${title}</p>`;

  return {
    id,
    title,
    handle,
    descriptionHtml,
    vendor: null,
    productType,
    tags,
    options: variants.length > 1 ? options : [],
    images,
    variants,
    sourceUrl: product.permalink || `https://${domain}/?p=${id}`,
  };
}

export async function fetchWooCommerceProducts(
  source: string,
  options?: { limit?: number; maxPages?: number; page?: number; pageSize?: number }
): Promise<{ domain: string; products: PublicShopifyProduct[] }> {
  const domain = normalizePublicShopifyDomain(source);
  if (!domain) {
    throw new Error("Informe um dominio WooCommerce valido.");
  }

  const limit = Math.min(Math.max(Math.floor(options?.limit || 250), 1), 5000);
  const singlePage = options?.page ? Math.max(Math.floor(options.page), 1) : null;
  const pageSize = Math.min(
    Math.max(Math.floor(options?.pageSize || (singlePage ? limit : 100)), 1),
    100
  );
  const maxPages = singlePage
    ? 1
    : Math.min(
        Math.max(Math.floor(options?.maxPages || Math.ceil(limit / pageSize)), 1),
        200
      );

  const rawProducts: WooProduct[] = [];
  for (let offset = 0; offset < maxPages && rawProducts.length < limit; offset += 1) {
    const page = singlePage || offset + 1;
    const url = `${wooApiBase(domain)}?per_page=${pageSize}&page=${page}`;
    const res = await fetchWithImportProxy(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      if (page === 1) {
        throw new Error(
          `Nao foi possivel ler produtos da loja WooCommerce (${res.status}).`
        );
      }
      break;
    }
    const data = await res.json().catch(() => null);
    const pageProducts = Array.isArray(data) ? (data as WooProduct[]) : [];
    if (pageProducts.length === 0) break;
    rawProducts.push(...pageProducts);
  }

  const sliced = rawProducts.slice(0, limit);

  // Normaliza com concorrencia limitada (variacoes sao 1 request por produto
  // variavel). Pool simples para nao estourar o servidor da loja de origem.
  const products: PublicShopifyProduct[] = [];
  const CONCURRENCY = 5;
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sliced.length) }, async () => {
      while (nextIndex < sliced.length) {
        const current = sliced[nextIndex++];
        const normalized = await toPublicProduct(domain, current);
        if (normalized) products.push(normalized);
      }
    })
  );

  return { domain, products };
}
