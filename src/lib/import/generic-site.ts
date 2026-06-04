import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { UnifiedImportProduct } from "@/lib/import/source-adapters";

type JsonRecord = Record<string, unknown>;

interface OptionGroup {
  name: string;
  values: string[];
}

const GENERIC_HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ShopifyCreator/1.0",
};

function normalizeInputUrl(source: string) {
  const value = source.trim();
  if (!value) throw new Error("Informe uma URL de origem.");
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) return normalized;
  }
  return "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function descriptionToHtml(value: string) {
  const normalized = value.trim();
  if (!normalized) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(normalized)) return normalized;
  return `<p>${escapeHtml(normalized).replace(/\n{2,}/g, "</p><p>")}</p>`;
}

function parseMoney(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value.toFixed(2) : "0.00";
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "0.00";

  const match = raw.match(/(\d[\d.,\s]*)/);
  if (!match) return "0.00";

  let numeric = match[1].replace(/\s/g, "");
  const hasComma = numeric.includes(",");
  const hasDot = numeric.includes(".");

  if (hasComma && hasDot) {
    numeric =
      numeric.lastIndexOf(",") > numeric.lastIndexOf(".")
        ? numeric.replace(/\./g, "").replace(",", ".")
        : numeric.replace(/,/g, "");
  } else if (hasComma) {
    numeric = numeric.replace(",", ".");
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "0.00";
}

function absoluteUrl(value: string, baseUrl: string) {
  const clean = value.trim();
  if (!clean || /^data:/i.test(clean)) return "";
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return "";
  }
}

function srcFromSrcset(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .find(Boolean) || "";
}

function readMeta($: cheerio.CheerioAPI, keys: string[]) {
  for (const key of keys) {
    const value = $(
      `meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`
    )
      .first()
      .attr("content");
    if (value?.trim()) return value.trim();
  }
  return "";
}

function collectJsonNodes(value: unknown, nodes: JsonRecord[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonNodes(item, nodes));
    return nodes;
  }

  const record = asRecord(value);
  if (!record) return nodes;
  nodes.push(record);

  ["@graph", "itemListElement", "mainEntity", "mainEntityOfPage", "offers"].forEach(
    (key) => {
      if (record[key] !== undefined) collectJsonNodes(record[key], nodes);
    }
  );

  const item = asRecord(record.item);
  if (item) collectJsonNodes(item, nodes);

  return nodes;
}

function typeMatches(record: JsonRecord, expectedType: string) {
  const rawType = record["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some(
    (type) =>
      typeof type === "string" &&
      type.toLowerCase().includes(expectedType.toLowerCase())
  );
}

function collectJsonLdProducts($: cheerio.CheerioAPI) {
  const products: JsonRecord[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      collectJsonNodes(parsed).forEach((node) => {
        if (typeMatches(node, "Product")) products.push(node);
      });
    } catch {
      // Algumas lojas inserem JSON-LD quebrado; nesses casos seguimos com metatags.
    }
  });

  return products;
}

function extractImageCandidates(value: unknown, output: string[] = []) {
  if (!value) return output;

  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => extractImageCandidates(item, output));
    return output;
  }

  const record = asRecord(value);
  if (!record) return output;

  ["url", "src", "contentUrl", "thumbnailUrl"].forEach((key) => {
    if (typeof record[key] === "string") output.push(record[key] as string);
  });

  return output;
}

function isUsefulImage(url: string) {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(svg|ico)(\?|#|$)/i.test(lower)) return false;
  return !/(favicon|sprite|icon-|logo|placeholder|payment|boleto|pix|avatar)/i.test(
    lower
  );
}

function collectImages(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  productJson: JsonRecord | null
) {
  const candidates = [
    ...extractImageCandidates(productJson?.image),
    ...extractImageCandidates(productJson?.images),
    readMeta($, ["og:image", "twitter:image", "image"]),
  ];

  $("img").each((_, element) => {
    const image = $(element);
    candidates.push(
      image.attr("src") || "",
      image.attr("data-src") || "",
      image.attr("data-original") || "",
      image.attr("data-zoom-image") || "",
      srcFromSrcset(image.attr("srcset") || image.attr("data-srcset") || "")
    );
  });

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const url = absoluteUrl(candidate, sourceUrl);
    const key = url.replace(/[?&](width|height|w|h|size)=\d+/gi, "");
    if (!url || seen.has(key) || !isUsefulImage(url)) continue;
    seen.add(key);
    images.push(url);
    if (images.length >= 30) break;
  }

  return images;
}

function offerRecords(productJson: JsonRecord | null) {
  const offers = productJson?.offers;
  if (Array.isArray(offers)) {
    return offers.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  }
  const offer = asRecord(offers);
  return offer ? [offer] : [];
}

function priceFromJson(productJson: JsonRecord | null) {
  const offers = offerRecords(productJson);
  for (const offer of offers) {
    const price = parseMoney(
      offer.price || offer.lowPrice || offer.highPrice || offer.priceSpecification
    );
    if (price !== "0.00") return price;
  }
  return parseMoney(productJson?.price);
}

function compareAtFromJson(productJson: JsonRecord | null, price: string) {
  const offers = offerRecords(productJson);
  for (const offer of offers) {
    const compareAt = parseMoney(offer.highPrice || offer.compareAtPrice);
    if (Number(compareAt) > Number(price)) return compareAt;
  }
  return null;
}

function priceFromPage($: cheerio.CheerioAPI, productJson: JsonRecord | null) {
  const fromJson = priceFromJson(productJson);
  if (fromJson !== "0.00") return fromJson;

  const fromMeta = parseMoney(
    readMeta($, [
      "product:price:amount",
      "og:price:amount",
      "twitter:data1",
      "price",
    ])
  );
  if (fromMeta !== "0.00") return fromMeta;

  const selectors = [
    "[itemprop='price']",
    "[data-price]",
    ".price",
    ".product-price",
    ".preco",
    ".valor",
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    const value = element.attr("content") || element.attr("data-price") || element.text();
    const parsed = parseMoney(value);
    if (parsed !== "0.00") return parsed;
  }

  return "0.00";
}

function cleanOptionName(raw: string) {
  const lower = raw.toLowerCase();
  if (/(cor|color|colour)/i.test(lower)) return "Cor";
  if (/(tamanho|size|tam\b)/i.test(lower)) return "Tamanho";
  if (/(modelo|model|estilo|style)/i.test(lower)) return "Modelo";
  if (/(sabor|flavor)/i.test(lower)) return "Sabor";

  const normalized = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(attribute|option|opcao|opção)\s*/i, "")
    .trim();

  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1, 32)
    : "Modelo";
}

function cleanOptionValue(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\+\s*R\$\s*[\d.,]+/i, "")
    .trim()
    .slice(0, 60);
}

function shouldSkipOptionName(name: string) {
  return /(quantity|quantidade|qty|qtd|cep|zip|frete|shipping|country|pais|país|estado|province|sort|ordenar|filter|filtro|parcel|installment)/i.test(
    name
  );
}

function isPlaceholderOption(value: string) {
  return /^(|--|selecione|selecionar|escolha|choose|select|op[cç][aã]o|tamanho|cor|modelo)$/i.test(
    value.trim()
  );
}

function mergeOptionGroups(groups: OptionGroup[]) {
  const byName = new Map<string, OptionGroup>();

  for (const group of groups) {
    const name = cleanOptionName(group.name);
    if (shouldSkipOptionName(name)) continue;

    const existing = byName.get(name) || { name, values: [] };
    const seen = new Set(existing.values.map((value) => value.toLowerCase()));
    for (const rawValue of group.values) {
      const value = cleanOptionValue(rawValue);
      if (!value || isPlaceholderOption(value)) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      existing.values.push(value);
    }
    if (existing.values.length > 0) byName.set(name, existing);
  }

  return Array.from(byName.values())
    .filter((group) => group.values.length > 1)
    .slice(0, 3);
}

function labelForControl($: cheerio.CheerioAPI, element: Element) {
  const control = $(element);
  const id = control.attr("id");
  if (id) {
    const label = $(`label[for="${id.replace(/"/g, '\\"')}"]`).first().text();
    if (label.trim()) return label.trim();
  }
  return (
    control.attr("aria-label") ||
    control.attr("data-option-name") ||
    control.attr("name") ||
    control.attr("id") ||
    ""
  );
}

function collectOptionGroups($: cheerio.CheerioAPI) {
  const groups: OptionGroup[] = [];

  $("select").each((_, element) => {
    const select = $(element);
    const rawName = labelForControl($, element);
    const name = rawName || select.closest("label").text() || "Modelo";
    if (shouldSkipOptionName(name)) return;

    const values: string[] = [];
    select.find("option").each((__, optionElement) => {
      const option = $(optionElement);
      const value = cleanOptionValue(option.text() || option.attr("value") || "");
      if (!value || isPlaceholderOption(value)) return;
      values.push(value);
    });

    groups.push({ name, values });
  });

  const radioGroups = new Map<string, OptionGroup>();
  $("input[type='radio']").each((_, element) => {
    const input = $(element);
    const key = input.attr("name") || input.attr("data-option-name") || "";
    if (!key || shouldSkipOptionName(key)) return;

    const group = radioGroups.get(key) || { name: labelForControl($, element) || key, values: [] };
    const id = input.attr("id");
    const label = id ? $(`label[for="${id.replace(/"/g, '\\"')}"]`).first().text() : "";
    const value = cleanOptionValue(
      label ||
        input.attr("data-value") ||
        input.attr("title") ||
        input.attr("value") ||
        ""
    );
    if (value && !isPlaceholderOption(value)) group.values.push(value);
    radioGroups.set(key, group);
  });

  groups.push(...radioGroups.values());
  return mergeOptionGroups(groups);
}

function cartesianProduct(groups: OptionGroup[], limit = 100) {
  const rows: string[][] = [[]];
  for (const group of groups) {
    const next: string[][] = [];
    for (const row of rows) {
      for (const value of group.values) {
        next.push([...row, value]);
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    rows.splice(0, rows.length, ...next);
  }
  return rows;
}

function buildVariants(input: {
  productJson: JsonRecord | null;
  optionGroups: OptionGroup[];
  price: string;
  compareAtPrice: string | null;
}) {
  const offers = offerRecords(input.productJson);
  if (input.optionGroups.length > 0) {
    return cartesianProduct(input.optionGroups).map((optionValues, index) => ({
      sourceVariantId: `${input.productJson?.sku || "generic"}-${index + 1}`,
      sku: null,
      title: optionValues.join(" / "),
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      optionValues,
    }));
  }

  if (offers.length > 1) {
    const variants = offers
      .map((offer, index) => {
        const title = firstString(offer.name, offer.sku, offer["@id"], `Modelo ${index + 1}`);
        const offerPrice = parseMoney(offer.price || offer.lowPrice);
        return {
          sourceVariantId: firstString(offer.sku, offer["@id"], title),
          sku: typeof offer.sku === "string" ? offer.sku : null,
          title,
          price: offerPrice !== "0.00" ? offerPrice : input.price,
          compareAtPrice: input.compareAtPrice,
          optionValues: [title],
        };
      })
      .filter((variant) => variant.title);

    if (variants.length > 1) return variants;
  }

  return [
    {
      sourceVariantId:
        typeof input.productJson?.sku === "string" ? input.productJson.sku : undefined,
      sku: typeof input.productJson?.sku === "string" ? input.productJson.sku : null,
      title: "Default Title",
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      optionValues: [],
    },
  ];
}

function productTags(sourceUrl: string, productJson: JsonRecord | null) {
  const tags = new Set<string>(["diversos-sites"]);
  try {
    tags.add(new URL(sourceUrl).hostname.replace(/^www\./, ""));
  } catch {
    // URL ja foi validada antes, mas mantemos fallback defensivo.
  }

  const brand = asRecord(productJson?.brand);
  const brandName = firstString(brand?.name, productJson?.brand);
  const category = firstString(productJson?.category);
  if (brandName) tags.add(brandName);
  if (category) tags.add(category);

  return Array.from(tags).slice(0, 8);
}

function collectSourceAttributes(
  optionGroups: OptionGroup[],
  productJson: JsonRecord | null
) {
  const attributes = new Map<string, string>();

  function add(name: string, value: unknown) {
    const normalizedName = cleanOptionName(name);
    const normalizedValue = firstString(value);
    if (!normalizedName || !normalizedValue) return;
    attributes.set(normalizedName, normalizedValue.slice(0, 200));
  }

  optionGroups.forEach((group) => add(group.name, group.values.join(", ")));
  add("Marca", asRecord(productJson?.brand)?.name || productJson?.brand);
  add("Categoria", productJson?.category);
  add("SKU", productJson?.sku);
  add("MPN", productJson?.mpn);
  add("GTIN", productJson?.gtin || productJson?.gtin13 || productJson?.gtin14);
  add("Material", productJson?.material);
  add("Cor", productJson?.color);
  add("Tamanho", productJson?.size);

  return Array.from(attributes, ([name, value]) => ({ name, value }));
}

function isLikelyProductUrl(sourceUrl: string) {
  try {
    const path = new URL(sourceUrl).pathname;
    return /\/(produto|produtos|product|products|item|p)\//i.test(path);
  } catch {
    return false;
  }
}

function normalizeGenericPage(
  sourceUrl: string,
  html: string
): UnifiedImportProduct | null {
  const $ = cheerio.load(html);
  const productJson = collectJsonLdProducts($)[0] || null;
  const title = firstString(
    productJson?.name,
    productJson?.headline,
    $("[itemprop='name']").first().text(),
    $("h1").first().text(),
    readMeta($, ["og:title", "twitter:title"]),
    $("title").first().text()
  ).slice(0, 160);

  const price = priceFromPage($, productJson);
  const compareAtPrice = compareAtFromJson(productJson, price);
  const images = collectImages($, sourceUrl, productJson);
  const hasProductSignal =
    Boolean(productJson) || price !== "0.00" || isLikelyProductUrl(sourceUrl);

  if (!title || images.length === 0 || !hasProductSignal) return null;

  const descriptionHtml = firstString(productJson?.description)
    ? descriptionToHtml(firstString(productJson?.description))
    : descriptionToHtml(
        firstString(
          $("#product-description").html(),
          $(".product-description").first().html(),
          $(".product__description").first().html(),
          $("[itemprop='description']").first().html(),
          $(".descricao").first().html(),
          readMeta($, ["description", "og:description", "twitter:description"])
        )
      );
  const optionGroups = collectOptionGroups($);
  const variants = buildVariants({
    productJson,
    optionGroups,
    price,
    compareAtPrice,
  });
  const sourceCategory = firstString(productJson?.category);

  return {
    sourceType: "generic_site",
    sourceUrl,
    sourceProductId: firstString(productJson?.sku, productJson?.productID, productJson?.mpn),
    handle: new URL(sourceUrl).pathname.split("/").filter(Boolean).pop(),
    sourceCategory: sourceCategory || null,
    sourceAttributes: collectSourceAttributes(optionGroups, productJson),
    title,
    descriptionHtml,
    price,
    compareAtPrice,
    images: images.map((src) => ({ src, altText: title })),
    tags: productTags(sourceUrl, productJson),
    options:
      optionGroups.length > 0
        ? optionGroups.map((group) => group.name)
        : variants.length > 1
          ? ["Modelo"]
          : [],
    variants,
    raw: {
      source: "generic_site",
      jsonLd: productJson,
      optionGroups,
    },
  };
}

function collectProductLinks(sourceUrl: string, html: string, limit: number) {
  const $ = cheerio.load(html);
  const source = new URL(sourceUrl);
  const links: string[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const url = absoluteUrl(href, sourceUrl);
    if (!url) return;

    const parsed = new URL(url);
    if (parsed.hostname !== source.hostname) return;
    if (!isLikelyProductUrl(url)) return;

    parsed.hash = "";
    const normalized = parsed.toString();
    if (seen.has(normalized) || normalized === sourceUrl) return;
    seen.add(normalized);
    links.push(normalized);
  });

  return links.slice(0, limit);
}

async function fetchHtml(source: string) {
  const res = await fetch(source, {
    headers: GENERIC_HEADERS,
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Nao foi possivel ler a pagina (${res.status}).`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("A origem nao retornou uma pagina HTML de produto.");
  }

  return {
    finalUrl: res.url || source,
    html: await res.text(),
  };
}

export async function fetchGenericSiteProducts(
  source: string,
  options?: { limit?: number }
): Promise<{ domain: string; products: UnifiedImportProduct[] }> {
  const sourceUrl = normalizeInputUrl(source);
  const limit = Math.min(Math.max(Math.floor(options?.limit || 1), 1), 50);
  const { finalUrl, html } = await fetchHtml(sourceUrl);
  const domain = new URL(finalUrl).hostname.replace(/^www\./, "");

  const directProduct = normalizeGenericPage(finalUrl, html);
  if (directProduct) {
    return { domain, products: [directProduct] };
  }

  const productLinks = collectProductLinks(finalUrl, html, limit);
  const products: UnifiedImportProduct[] = [];

  for (const link of productLinks) {
    try {
      const linkedPage = await fetchHtml(link);
      const product = normalizeGenericPage(linkedPage.finalUrl, linkedPage.html);
      if (product) products.push(product);
      if (products.length >= limit) break;
    } catch {
      // Continua com os demais links descobertos na vitrine.
    }
  }

  if (products.length === 0) {
    throw new Error(
      "Nao encontrei dados suficientes de produto nessa pagina. Tente uma URL de produto ou uma vitrine com links de produtos."
    );
  }

  return { domain, products };
}
