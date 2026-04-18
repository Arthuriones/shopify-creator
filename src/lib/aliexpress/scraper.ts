import * as cheerio from "cheerio";
import type {
  AliExpressProduct,
  AliExpressVariant,
  AliExpressVariantOption,
} from "@/types";
import { scrapeProductWithBrowser } from "./browser-scraper";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

const PRODUCT_IMAGE_PATH_HINTS = ["/kf/", "/imgextra/", "/bao/uploaded/"];
const BLOCKED_IMAGE_HINTS = [
  "404",
  "not-found",
  "flag",
  "country",
  "icon",
  "logo",
  "avatar",
  "placeholder",
  "no_photo",
  "nophoto",
  "default",
  "loading",
  "sprite",
  "lazy",
];

export async function scrapeProduct(url: string): Promise<AliExpressProduct> {
  const cleanUrl = normalizeUrl(url);

  const browserProduct = await scrapeProductWithBrowser(cleanUrl).catch(() => null);
  if (browserProduct && browserProduct.title && browserProduct.images.length > 0) {
    return browserProduct;
  }

  const html = await fetchBestAliExpressHtml(cleanUrl);
  const product = parseProductPage(html);

  if (!product.title || isLikelyInvalidProduct(product)) {
    throw new Error(
      "Nao foi possivel extrair este anuncio. O AliExpress pode ter retornado uma pagina invalida (404/bloqueio)."
    );
  }

  if (product.images.length === 0) {
    throw new Error("Nao foi possivel extrair as imagens do produto.");
  }

  return product;
}

async function fetchBestAliExpressHtml(url: string): Promise<string> {
  const candidates = buildCandidateUrls(url);
  let lastStatus = 0;

  for (const candidate of candidates) {
    const res = await fetch(candidate, {
      headers: {
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    lastStatus = res.status;
    if (!res.ok) continue;

    const html = await res.text();
    if (isLikelyNotFoundPage(html)) continue;

    return html;
  }

  throw new Error(
    lastStatus
      ? `Erro ao acessar AliExpress (${lastStatus}).`
      : "Nao foi possivel acessar o anuncio no AliExpress."
  );
}

function buildCandidateUrls(inputUrl: string): string[] {
  const urls = new Set<string>();
  urls.add(inputUrl);

  try {
    const parsed = new URL(inputUrl);
    if (!parsed.searchParams.has("gatewayAdapt")) {
      parsed.searchParams.set("gatewayAdapt", "4itemAdapt");
      urls.add(parsed.toString());
    }
  } catch {
    // ignore
  }

  const productId = extractAliProductId(inputUrl);
  if (productId) {
    urls.add(`https://www.aliexpress.com/item/${productId}.html?gatewayAdapt=4itemAdapt`);
    urls.add(`https://pt.aliexpress.com/item/${productId}.html?gatewayAdapt=4itemAdapt`);
    urls.add(`https://m.aliexpress.com/item/${productId}.html`);
  }

  return [...urls];
}

function extractAliProductId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/item\/(\d{8,})\.html/i);
    if (pathMatch?.[1]) return pathMatch[1];

    const queryCandidates = [
      parsed.searchParams.get("productId"),
      parsed.searchParams.get("itemId"),
      parsed.searchParams.get("id"),
    ];
    const queryId = queryCandidates.find((value) => value && /^\d{8,}$/.test(value));
    if (queryId) return queryId;

    const text = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const looseMatch = text.match(/(\d{10,})/);
    if (looseMatch?.[1]) return looseMatch[1];
  } catch {
    return null;
  }

  return null;
}

function isLikelyNotFoundPage(html: string): boolean {
  const sample = html.slice(0, 8000).toLowerCase();
  return (
    /<title>\s*404/i.test(html) ||
    sample.includes("404 page") ||
    sample.includes("page not found") ||
    sample.includes("sorry, this page") ||
    sample.includes("oops! looks like the page") ||
    sample.includes("the page you requested can not be found")
  );
}

function isLikelyInvalidProduct(product: AliExpressProduct): boolean {
  const title = product.title.toLowerCase();
  return (
    title.startsWith("404") ||
    title.includes("page not found") ||
    title.includes("not found") ||
    title === "404 page"
  );
}
function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL invÃƒÂ¡lida. Cole o link completo do produto.");
  }

  const allowedHosts = [
    "aliexpress.com",
    "www.aliexpress.com",
    "pt.aliexpress.com",
    "m.aliexpress.com",
    "br.aliexpress.com",
  ];

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error("URL deve ser do AliExpress");
  }

  parsed.protocol = "https:";
  return parsed.toString();
}

function emptyProduct(): AliExpressProduct {
  return {
    title: "",
    description: "",
    price: 0,
    originalPrice: 0,
    images: [],
    specs: {},
    rating: 0,
    orders: 0,
    variantOptions: [],
    variants: [],
  };
}

function parseProductPage(html: string): AliExpressProduct {
  const $ = cheerio.load(html);
  let productData = emptyProduct();

  const jsonCandidates: Record<string, unknown>[] = [];

  $("script").each((_, el) => {
    const type = ($(el).attr("type") || "").toLowerCase();
    const scriptText = $(el).html() || "";

    if (!scriptText.trim()) return;

    if (type.includes("ld+json")) {
      const parsed = safeJsonParse(scriptText);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item && typeof item === "object") {
            jsonCandidates.push(item as Record<string, unknown>);
          }
        });
      } else if (parsed && typeof parsed === "object") {
        jsonCandidates.push(parsed as Record<string, unknown>);
      }
    }

    const markerMatches = [
      ...findMarkerMatches(scriptText, /runParams\s*=\s*/g),
      ...findMarkerMatches(scriptText, /__INIT_DATA__\s*=\s*/g),
      ...findMarkerMatches(scriptText, /__INITIAL_STATE__\s*=\s*/g),
      ...findMarkerMatches(scriptText, /_init_data_\s*=\s*/g),
      ...findMarkerMatches(scriptText, /window\.__next_f\s*=\s*/g),
      ...findMarkerMatches(scriptText, /data\s*:\s*/g),
    ];

    for (const markerIndex of markerMatches) {
      const candidate = extractBalancedObject(scriptText, markerIndex);
      if (!candidate) continue;
      const parsed = safeJsonParse(candidate);
      if (parsed && typeof parsed === "object") {
        jsonCandidates.push(parsed as Record<string, unknown>);
      }
    }
  });

  for (const candidate of jsonCandidates) {
    productData = mergeProductData(productData, extractFromData(candidate));
  }

  if (!productData.title) {
    productData.title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $('meta[property="twitter:title"]').attr("content")?.trim() ||
      $('h1[data-pl="product-title"]').text().trim() ||
      $("h1.product-title-text").text().trim() ||
      $("title").text().split("|")[0]?.trim() ||
      "";
  }

  if (!productData.description) {
    productData.description =
      $('meta[property="og:description"]').attr("content")?.trim() ||
      $('meta[name="description"]').attr("content")?.trim() ||
      "";
  }

  productData.title = cleanProductTitle(productData.title);

  const domImages = collectDomImages($);
  const htmlImages = collectImageUrlsFromText(html);
  productData.images = uniqueImages([
    ...productData.images,
    ...domImages,
    ...htmlImages,
  ]);

  if (!productData.price) {
    const priceText =
      $(".product-price-value").first().text() ||
      $('[data-pl="product-price"]').text() ||
      $('[data-pl="product-price-current"]').text() ||
      $(".uniform-banner-box-price").text();
    productData.price = parseNumber(priceText) || 0;
  }

  if (!productData.originalPrice) {
    productData.originalPrice = productData.price;
  }

  return productData;
}

function findMarkerMatches(text: string, regex: RegExp): number[] {
  const matches: number[] = [];
  regex.lastIndex = 0;

  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    matches.push(match.index + match[0].length);
    match = regex.exec(text);
  }

  return matches;
}

function extractBalancedObject(text: string, fromIndex: number): string | null {
  const start = text.indexOf("{", fromIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanProductTitle(title: string): string {
  return title
    .replace(/\s*[-|â€“]\s*AliExpress.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectDomImages($: cheerio.CheerioAPI): string[] {
  const images = new Set<string>();

  const push = (value: string | undefined) => {
    const normalized = normalizeImageUrl(value);
    if (normalized) images.add(normalized);
  };

  push($('meta[property="og:image"]').attr("content"));
  push($('meta[property="twitter:image"]').attr("content"));

  const selectors = [
    'img[src*="alicdn.com/kf/"]',
    'img[data-src*="alicdn.com/kf/"]',
    'img[data-origin-src*="alicdn.com/kf/"]',
    'img[src*="alicdn.com/imgextra/"]',
    'img[src*="aliexpress-media.com"]',
  ];

  $(selectors.join(",")).each((_, img) => {
    const node = $(img);
    push(node.attr("src"));
    push(node.attr("data-src"));
    push(node.attr("data-origin-src"));
    push(node.attr("data-ks-lazyload"));

    const srcSet = node.attr("srcset");
    if (srcSet) {
      srcSet
        .split(",")
        .map((part) => part.trim().split(" ")[0])
        .forEach(push);
    }
  });

  return [...images];
}

function decodeAliText(text: string): string {
  return text
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/");
}

function collectImageUrlsFromText(text: string): string[] {
  const images = new Set<string>();
  const normalizedText = decodeAliText(text);
  const regex =
    /(https?:\/\/|\/\/)[^"'\\s]+?(?:alicdn\.com|aliexpress-media\.com)[^"'\\s]+?\.(?:jpg|jpeg|png|webp|avif)(?:[^"'\\s]*)/gi;
  let match: RegExpExecArray | null = regex.exec(normalizedText);

  while (match) {
    const normalized = normalizeImageUrl(match[0]);
    if (normalized) images.add(normalized);
    match = regex.exec(normalizedText);
  }

  return [...images];
}

function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;

  let value = url.trim();
  if (!value) return null;

  value = value
    .replace(/&amp;/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/^http:\/\//i, "https://");

  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  if (!value.startsWith("https://")) return null;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const isAliCdn = host.includes("alicdn.com");
    const isAliExpressMedia = host.includes("aliexpress-media.com");
    const isAliExpressHost = host.includes("aliexpress.com");

    if (!isAliCdn && !isAliExpressMedia && !isAliExpressHost) {
      return null;
    }

    if (!PRODUCT_IMAGE_PATH_HINTS.some((hint) => path.includes(hint))) {
      return null;
    }

    if (BLOCKED_IMAGE_HINTS.some((hint) => path.includes(hint))) {
      return null;
    }

    if (looksLikeTinyImage(parsed.pathname)) {
      return null;
    }
  } catch {
    return null;
  }

  value = value
    .replace(/\.jpg_\d+x\d+\.jpg$/i, ".jpg")
    .replace(/\.jpeg_\d+x\d+\.jpeg$/i, ".jpeg")
    .replace(/\.png_\d+x\d+\.png$/i, ".png")
    .replace(/\.webp_\d+x\d+\.webp$/i, ".webp")
    .replace(/_\d+x\d+\.(jpg|jpeg|png|webp)$/i, ".$1")
    .replace(/\?.*$/, "");

  return value;
}

function uniqueImages(images: string[]): string[] {
  return [...new Set(images.map((img) => normalizeImageUrl(img)).filter(Boolean) as string[])];
}

function looksLikeTinyImage(pathname: string): boolean {
  const match = pathname.match(/(\d{2,4})x(\d{2,4})/);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return width <= 120 && height <= 120;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const firstChunk = value.match(/\d[\d.,]*/)?.[0];
  if (!firstChunk) return 0;

  let normalized = firstChunk;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const [, decimal = ""] = normalized.split(",");
    normalized = decimal.length > 0 && decimal.length <= 2
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractFromData(data: Record<string, unknown>): AliExpressProduct {
  const result = emptyProduct();
  const imageCandidates = new Set<string>();

  // Map de propertyValueId -> { name, propertyName, image }
  const propValueMap = new Map<string, { name: string; propertyName: string; image?: string }>();

  const pushImage = (value: unknown) => {
    if (typeof value === "string") {
      const normalized = normalizeImageUrl(value);
      if (normalized) imageCandidates.add(normalized);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(pushImage);
      return;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const knownUrlKeys = [
        "imagePath",
        "imageUrl",
        "imgUrl",
        "src",
        "url",
        "skuPropertyImagePath",
      ];
      for (const key of knownUrlKeys) {
        if (record[key]) {
          pushImage(record[key]);
        }
      }
    }
  };

  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;

    if (typeof record.subject === "string" && !result.title) {
      result.title = record.subject;
    }
    if (typeof record.description === "string" && !result.description) {
      result.description = record.description;
    }

    if (record.minPrice && !result.price) {
      result.price = parseNumber(record.minPrice);
    }
    if (record.maxPrice && !result.originalPrice) {
      result.originalPrice = parseNumber(record.maxPrice);
    }
    if (record.averageStar && !result.rating) {
      result.rating = parseNumber(record.averageStar);
    }
    if (record.tradeCount && !result.orders) {
      result.orders = parseNumber(record.tradeCount);
    }

    if (Array.isArray(record.attrList)) {
      for (const attr of record.attrList) {
        const a = attr as Record<string, string>;
        if (a.attrName && a.attrValue) {
          result.specs[a.attrName] = a.attrValue;
        }
      }
    }

    if (Array.isArray(record.productSKUPropertyList) && result.variantOptions.length === 0) {
      for (const prop of record.productSKUPropertyList) {
        const p = prop as Record<string, unknown>;
        const propName = (p.skuPropertyName as string) || "";
        const values = p.skuPropertyValues as Record<string, unknown>[] | undefined;
        if (!propName || !Array.isArray(values)) continue;

        const option: AliExpressVariantOption = { name: propName, values: [] };
        for (const val of values) {
          const v = val as Record<string, unknown>;
          const valueName =
            (v.propertyValueDisplayName as string) ||
            (v.propertyValueName as string) ||
            "";
          const image = normalizeImageUrl(v.skuPropertyImagePath as string);
          const valueId = String(v.propertyValueId || v.propertyValueIdLong || "");

          if (valueName) {
            option.values.push({ name: valueName, image: image || undefined });
            if (valueId) {
              propValueMap.set(valueId, {
                name: valueName,
                propertyName: propName,
                image: image || undefined,
              });
            }
          }
        }
        if (option.values.length > 0) result.variantOptions.push(option);
      }
    }

    if (Array.isArray(record.skuPriceList) && result.variants.length === 0) {
      for (const sku of record.skuPriceList) {
        const s = sku as Record<string, unknown>;
        const skuAttr = (s.skuAttr as string) || (s.skuPropIds as string) || "";
        const skuVal = (s.skuVal as Record<string, unknown>) || s;

        const sv = skuVal as Record<string, unknown>;
        const skuActivity = sv.skuActivityAmount as Record<string, unknown> | undefined;
        const skuAmount = sv.skuAmount as Record<string, unknown> | undefined;
        const price =
          parseNumber(skuActivity?.amountText) ||
          parseNumber(sv.actSkuCalPrice) ||
          parseNumber(skuAmount?.amountText) ||
          parseNumber(sv.skuCalPrice);
        const originalPrice =
          parseNumber(skuAmount?.amountText) ||
          parseNumber(sv.skuCalPrice) ||
          price;
        const stock = parseNumber(s.skuStock) || parseNumber(s.availQuantity) || 0;

        const properties: Record<string, string> = {};
        if (skuAttr) {
          const parts = skuAttr.split(";");
          for (const part of parts) {
            const match = part.match(/:(\d+)/g);
            if (match && match.length >= 2) {
              const valueId = match[match.length - 1].slice(1);
              const mapped = propValueMap.get(valueId);
              if (mapped) {
                properties[mapped.propertyName] = mapped.name;
              }
            }

            const hashMatch = part.match(/#(.+)/);
            if (hashMatch) {
              const propId = part.split(":")[0];
              const foundProp = result.variantOptions.find((opt) =>
                propValueMap.size > 0 ? true : opt.values.some((v) => v.name === hashMatch[1])
              );
              if (foundProp && !properties[foundProp.name]) {
                properties[foundProp.name] = hashMatch[1];
              } else if (!Object.values(properties).includes(hashMatch[1])) {
                properties[`prop_${propId}`] = hashMatch[1];
              }
            }
          }
        }

        if (price > 0) {
          result.variants.push({
            sku: (s.skuId as string) || String(s.skuIdStr || ""),
            properties,
            price,
            originalPrice,
            stock,
          });
        }
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (
        /(imagepathlist|imagelist|imageurl|imagepath|mainimage|gallery|skuimage|skupropertyimagepath|picurl|thumb)/i.test(
          key
        )
      ) {
        pushImage(value);
      }
    }

    for (const value of Object.values(record)) {
      if (typeof value === "object") walk(value);
    }
  };

  walk(data);
  result.images = uniqueImages([...imageCandidates]);
  return result;
}

function mergeVariantOptions(
  a: AliExpressVariantOption[],
  b: AliExpressVariantOption[]
): AliExpressVariantOption[] {
  const map = new Map<string, AliExpressVariantOption>();

  for (const option of [...a, ...b]) {
    if (!map.has(option.name)) {
      map.set(option.name, { name: option.name, values: [] });
    }
    const current = map.get(option.name)!;
    for (const value of option.values) {
      if (!current.values.some((v) => v.name === value.name)) {
        current.values.push(value);
      }
    }
  }

  return [...map.values()];
}

function mergeVariants(a: AliExpressVariant[], b: AliExpressVariant[]): AliExpressVariant[] {
  const bySku = new Map<string, AliExpressVariant>();
  [...a, ...b].forEach((variant) => {
    if (variant.sku) bySku.set(variant.sku, variant);
  });
  return [...bySku.values()];
}

function mergeProductData(existing: AliExpressProduct, incoming: AliExpressProduct): AliExpressProduct {
  return {
    title: existing.title || incoming.title,
    description: existing.description || incoming.description,
    price: existing.price || incoming.price,
    originalPrice: existing.originalPrice || incoming.originalPrice || existing.price || incoming.price,
    images: uniqueImages([...existing.images, ...incoming.images]),
    specs: { ...incoming.specs, ...existing.specs },
    rating: existing.rating || incoming.rating,
    orders: existing.orders || incoming.orders,
    variantOptions: mergeVariantOptions(existing.variantOptions, incoming.variantOptions),
    variants: mergeVariants(existing.variants, incoming.variants),
  };
}

