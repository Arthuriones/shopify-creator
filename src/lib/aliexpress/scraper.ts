import * as cheerio from "cheerio";
import type { AliExpressProduct, AliExpressVariantOption, AliExpressVariant } from "@/types";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

export async function scrapeProduct(url: string): Promise<AliExpressProduct> {
  const cleanUrl = normalizeUrl(url);

  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Erro ao acessar AliExpress (${res.status}). Tente novamente.`);
  }

  const html = await res.text();
  const product = parseProductPage(html);

  if (!product.title) {
    throw new Error(
      "Não foi possível extrair o produto. O AliExpress pode estar bloqueando. Tente novamente em alguns segundos."
    );
  }

  return product;
}

function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL inválida. Cole o link completo do produto.");
  }

  const ALLOWED_HOSTS = [
    "aliexpress.com",
    "www.aliexpress.com",
    "pt.aliexpress.com",
    "m.aliexpress.com",
    "br.aliexpress.com",
  ];
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error("URL deve ser do AliExpress");
  }

  // Garantir HTTPS
  parsed.protocol = "https:";
  return parsed.toString();
}

function parseProductPage(html: string): AliExpressProduct {
  const $ = cheerio.load(html);

  let productData: AliExpressProduct = {
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

  // Estratégia 1: extrair do JSON embutido no script (mais confiável)
  $("script").each((_, el) => {
    const text = $(el).html() || "";

    // Tentar __INIT_DATA__ ou data: {...}
    if (
      text.includes("actionModule") ||
      text.includes("titleModule") ||
      text.includes("imagePathList") ||
      text.includes("subject")
    ) {
      try {
        const match = text.match(/data:\s*({[\s\S]+})/);
        if (match) {
          const data = JSON.parse(match[1]);
          productData = extractFromData(data);
        }
      } catch {
        // Fallback silencioso
      }
    }

    // Tentar window.runParams
    if (text.includes("runParams")) {
      try {
        const match = text.match(/runParams\s*=\s*({[\s\S]+?});\s*(?:var|window|<\/script>)/);
        if (match) {
          const data = JSON.parse(match[1]);
          productData = mergeProductData(productData, extractFromData(data));
        }
      } catch {
        // Fallback silencioso
      }
    }
  });

  // Estratégia 2: Extrair do meta tags (muito confiável)
  if (!productData.title) {
    productData.title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
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

  // Imagens do og:image ou DOM
  if (productData.images.length === 0) {
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) productData.images.push(ogImage);

    $("img.magnifier-image, img[data-role='thumb'], .image-view-magnifier-wrap img").each(
      (_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src");
        if (src && !productData.images.includes(src)) {
          // Remover sufixo de resize pra pegar imagem full
          productData.images.push(src.replace(/_\d+x\d+\w*/, ""));
        }
      }
    );
  }

  // Garantir HTTPS nas imagens
  productData.images = productData.images
    .map((img) => {
      if (img.startsWith("//")) return `https:${img}`;
      return img;
    })
    .filter((img) => img.startsWith("https://"));

  // Preço do DOM se não encontrou
  if (!productData.price) {
    const priceText =
      $(".product-price-value").first().text() ||
      $('[data-pl="product-price"]').text() ||
      $(".uniform-banner-box-price").text();
    productData.price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;
  }

  return productData;
}

function extractFromData(data: Record<string, unknown>): AliExpressProduct {
  const result: AliExpressProduct = {
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

  // Map de propertyValueId -> { name, propertyName, image }
  const propValueMap = new Map<string, { name: string; propertyName: string; image?: string }>();

  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;

    if (typeof record.subject === "string" && !result.title)
      result.title = record.subject;
    if (typeof record.description === "string" && !result.description)
      result.description = record.description;
    if (Array.isArray(record.imagePathList) && result.images.length === 0)
      result.images = record.imagePathList as string[];

    if (record.minPrice && !result.price)
      result.price = Number(record.minPrice);
    if (record.maxPrice && !result.originalPrice)
      result.originalPrice = Number(record.maxPrice);
    if (record.averageStar && !result.rating)
      result.rating = Number(record.averageStar);
    if (record.tradeCount && !result.orders)
      result.orders = Number(record.tradeCount);

    // Specs
    if (Array.isArray(record.attrList)) {
      for (const attr of record.attrList) {
        const a = attr as Record<string, string>;
        if (a.attrName && a.attrValue) {
          result.specs[a.attrName] = a.attrValue;
        }
      }
    }

    // Variantes — productSKUPropertyList (opções como Cor, Tamanho)
    if (Array.isArray(record.productSKUPropertyList) && result.variantOptions.length === 0) {
      for (const prop of record.productSKUPropertyList) {
        const p = prop as Record<string, unknown>;
        const propName = (p.skuPropertyName as string) || "";
        const values = p.skuPropertyValues as Record<string, unknown>[] | undefined;
        if (!propName || !Array.isArray(values)) continue;

        const option: AliExpressVariantOption = { name: propName, values: [] };
        for (const val of values) {
          const v = val as Record<string, unknown>;
          const valueName = (v.propertyValueDisplayName as string) || (v.propertyValueName as string) || "";
          let image = (v.skuPropertyImagePath as string) || undefined;
          if (image?.startsWith("//")) image = `https:${image}`;
          const valueId = String(v.propertyValueId || v.propertyValueIdLong || "");

          if (valueName) {
            option.values.push({ name: valueName, image });
            if (valueId) {
              propValueMap.set(valueId, { name: valueName, propertyName: propName, image });
            }
          }
        }
        if (option.values.length > 0) result.variantOptions.push(option);
      }
    }

    // Variantes — skuPriceList (preços por SKU)
    if (Array.isArray(record.skuPriceList) && result.variants.length === 0) {
      for (const sku of record.skuPriceList) {
        const s = sku as Record<string, unknown>;
        const skuAttr = (s.skuAttr as string) || (s.skuPropIds as string) || "";
        const skuVal = (s.skuVal as Record<string, unknown>) || s;

        const sv = skuVal as Record<string, unknown>;
        const skuActivity = sv.skuActivityAmount as Record<string, unknown> | undefined;
        const skuAmount = sv.skuAmount as Record<string, unknown> | undefined;
        const price = Number(skuActivity?.amountText || sv.actSkuCalPrice || skuAmount?.amountText || sv.skuCalPrice || 0);
        const originalPrice = Number(skuAmount?.amountText || sv.skuCalPrice || price);
        const stock = Number(s.skuStock || s.availQuantity || 0);

        // Parse skuAttr: "200007763:201336106;14:771#M"
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
            // Fallback: valor após # (ex: "14:771#M")
            const hashMatch = part.match(/#(.+)/);
            if (hashMatch) {
              const propId = part.split(":")[0];
              // Tentar encontrar qual propriedade este ID representa
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

    for (const val of Object.values(record)) {
      if (typeof val === "object") walk(val);
    }
  };

  walk(data);
  return result;
}

function mergeProductData(
  existing: AliExpressProduct,
  incoming: AliExpressProduct
): AliExpressProduct {
  return {
    title: existing.title || incoming.title,
    description: existing.description || incoming.description,
    price: existing.price || incoming.price,
    originalPrice: existing.originalPrice || incoming.originalPrice,
    images: existing.images.length > 0 ? existing.images : incoming.images,
    specs: { ...incoming.specs, ...existing.specs },
    rating: existing.rating || incoming.rating,
    orders: existing.orders || incoming.orders,
    variantOptions: existing.variantOptions.length > 0 ? existing.variantOptions : incoming.variantOptions,
    variants: existing.variants.length > 0 ? existing.variants : incoming.variants,
  };
}
