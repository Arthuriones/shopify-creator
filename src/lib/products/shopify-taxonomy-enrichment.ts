import { suggestShopifyTaxonomy } from "@/lib/gemini/client";
import {
  searchShopifyTaxonomyCategories,
  type ShopifyCredentials,
  type ShopifyProductMetafieldInput,
  type ShopifyTaxonomyCategoryMatch,
} from "@/lib/shopify/client";
import type { StoreContext } from "@/types";

export interface ProductForTaxonomyEnrichment {
  title: string;
  descriptionHtml?: string;
  tags?: string[];
  productType?: string | null;
  sourceCategory?: string | null;
  sourceAttributes?: { name: string; value: string }[];
  options?: string[] | { name: string; values?: string[] }[];
  variants?: {
    title?: string;
    optionValues?: string[];
    selectedOptions?: { name: string; value: string }[];
  }[];
}

export interface ShopifyTaxonomyEnrichmentResult {
  category?: ShopifyTaxonomyCategoryMatch | null;
  categorySearch?: string;
  productType?: string | null;
  attributes: { name: string; key: string; value: string | string[] }[];
  metafields: ShopifyProductMetafieldInput[];
  source: "source" | "ai" | "mixed" | "none";
  warnings: string[];
}

const ATTRIBUTE_ALIASES: Record<string, { key: string; name: string }> = {
  cor: { key: "color", name: "Cor" },
  color: { key: "color", name: "Cor" },
  colour: { key: "color", name: "Cor" },
  tamanho: { key: "size", name: "Tamanho" },
  size: { key: "size", name: "Tamanho" },
  tam: { key: "size", name: "Tamanho" },
  genero: { key: "gender", name: "Genero" },
  "gênero": { key: "gender", name: "Genero" },
  gender: { key: "gender", name: "Genero" },
  sexo: { key: "gender", name: "Genero" },
  material: { key: "material", name: "Material" },
  tecido: { key: "material", name: "Material" },
  fabric: { key: "material", name: "Material" },
  estampa: { key: "pattern", name: "Estampa" },
  padrao: { key: "pattern", name: "Estampa" },
  pattern: { key: "pattern", name: "Estampa" },
  marca: { key: "brand", name: "Marca" },
  brand: { key: "brand", name: "Marca" },
  categoria: { key: "category_hint", name: "Categoria sugerida" },
  category: { key: "category_hint", name: "Categoria sugerida" },
  tipo: { key: "product_type_hint", name: "Tipo sugerido" },
};

const CATEGORY_PRODUCT_TYPE_HINTS: { pattern: RegExp; value: string }[] = [
  { pattern: /\bbracelets?\b|pulseiras?/i, value: "Pulseira" },
  { pattern: /\bnecklaces?\b|colares?/i, value: "Colar" },
  { pattern: /\brings?\b|aneis|an[eé]is/i, value: "Anel" },
  { pattern: /\bearrings?\b|brincos?/i, value: "Brinco" },
  { pattern: /\bwatches?\b|rel[oó]gios?/i, value: "Relogio" },
  { pattern: /\bshirts?\b|camisas?/i, value: "Camisa" },
  { pattern: /\bt-?shirts?\b|camisetas?/i, value: "Camiseta" },
  { pattern: /\bcoats?\b|casacos?/i, value: "Casaco" },
  { pattern: /\bjackets?\b|jaquetas?/i, value: "Jaqueta" },
  { pattern: /\bdresses?\b|vestidos?/i, value: "Vestido" },
  { pattern: /\b(shorts?)\b/i, value: "Shorts" },
  { pattern: /\bpants?\b|\btrousers?\b|cal[cç]as?/i, value: "Calca" },
  { pattern: /\bsneakers?\b|t[eê]nis/i, value: "Tenis" },
  { pattern: /\bshoes?\b|cal[cç]ados?/i, value: "Calcado" },
  { pattern: /\bhandbags?\b|\bbags?\b|bolsas?/i, value: "Bolsa" },
];

function normalizeKey(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function cleanValue(value: unknown): string | string[] | null {
  if (Array.isArray(value)) {
    const values = value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 50);
    return values.length ? [...new Set(values)] : null;
  }

  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const splitValues = text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (splitValues.length > 1 && text.length < 500) {
    return [...new Set(splitValues)].slice(0, 50);
  }

  return text.slice(0, 300);
}

function normalizeAttribute(name: string, value: unknown) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (!cleanName) return null;

  const normalizedKey = normalizeKey(cleanName);
  const alias = ATTRIBUTE_ALIASES[normalizedKey] || ATTRIBUTE_ALIASES[cleanName.toLowerCase()];
  const key = alias?.key || normalizedKey;
  const displayName = alias?.name || cleanName.slice(0, 60);
  const clean = cleanValue(value);

  if (!key || !clean) return null;
  return { name: displayName, key, value: clean };
}

function mergeAttributes(
  ...groups: ({ name: string; key?: string; value: unknown }[] | undefined)[]
) {
  const byKey = new Map<string, { name: string; key: string; value: string | string[] }>();

  for (const group of groups) {
    for (const attribute of group || []) {
      const normalized =
        attribute.key && attribute.value
          ? {
              name: attribute.name || attribute.key,
              key: normalizeKey(attribute.key),
              value: cleanValue(attribute.value),
            }
          : normalizeAttribute(attribute.name, attribute.value);
      if (!normalized?.key || !normalized.value) continue;
      if (!byKey.has(normalized.key)) {
        byKey.set(normalized.key, {
          name: normalized.name,
          key: normalized.key,
          value: normalized.value,
        });
      }
    }
  }

  return Array.from(byKey.values()).slice(0, 12);
}

function optionsFromProduct(product: ProductForTaxonomyEnrichment) {
  const options = Array.isArray(product.options) ? product.options : [];

  return options
    .map((option, index) => {
      if (typeof option === "string") {
        const values = [
          ...new Set(
            (product.variants || [])
              .map((variant) => variant.optionValues?.[index])
              .filter((value): value is string => Boolean(value))
          ),
        ];
        return { name: option, values };
      }

      return {
        name: option.name,
        values: option.values || [],
      };
    })
    .filter((option) => option.name);
}

function sourceAttributesFromOptions(product: ProductForTaxonomyEnrichment) {
  return optionsFromProduct(product)
    .map((option) => ({
      name: option.name,
      value: option.values.join(", "),
    }))
    .filter((attribute) => attribute.value);
}

function sourceCategorySearch(product: ProductForTaxonomyEnrichment) {
  return (
    product.sourceCategory ||
    product.productType ||
    product.tags?.find((tag) => /casaco|jaqueta|camisa|shirt|coat|jacket|dress|vestido/i.test(tag)) ||
    ""
  ).trim();
}

function categoryLeaf(input?: string | null) {
  return String(input || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop() || "";
}

function inferProductType(product: ProductForTaxonomyEnrichment, sourceCategory: string) {
  const existingType = String(product.productType || "").trim();
  if (existingType && existingType !== sourceCategory) return existingType;

  const text = `${product.title || ""} ${sourceCategory || ""}`;
  const match = CATEGORY_PRODUCT_TYPE_HINTS.find((hint) => hint.pattern.test(text));
  if (match) return match.value;

  return categoryLeaf(sourceCategory) || "";
}

function inferAudienceAttributes(product: ProductForTaxonomyEnrichment, sourceCategory: string) {
  const text = `${product.title || ""} ${sourceCategory || ""} ${(product.tags || []).join(" ")}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const attributes: { name: string; key: string; value: string }[] = [];

  if (/\b(women|womens|female|feminino|feminina|mulher|dama)\b/.test(text)) {
    attributes.push({ name: "Genero", key: "gender", value: "Feminino" });
  } else if (/\b(men|mens|male|masculino|homem)\b/.test(text)) {
    attributes.push({ name: "Genero", key: "gender", value: "Masculino" });
  } else if (/\b(unisex|unissex)\b/.test(text)) {
    attributes.push({ name: "Genero", key: "gender", value: "Unissex" });
  }

  if (/\b(kids|children|child|infantil|crianca|criancas|junior)\b/.test(text)) {
    attributes.push({ name: "Faixa etaria", key: "age_group", value: "Infantil" });
  } else if (/\b(baby|beb[eê])\b/.test(text)) {
    attributes.push({ name: "Faixa etaria", key: "age_group", value: "Bebe" });
  }

  return attributes;
}

function fallbackAttributes(product: ProductForTaxonomyEnrichment, sourceCategory: string) {
  const productType = inferProductType(product, sourceCategory);
  return mergeAttributes(
    productType
      ? [{ name: "Subtipo", key: "product_subtype", value: productType }]
      : [],
    inferAudienceAttributes(product, sourceCategory)
  );
}

function metafieldValue(value: string | string[]) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function metafieldType() {
  return "single_line_text_field";
}

function buildMetafields(input: {
  category?: ShopifyTaxonomyCategoryMatch | null;
  categorySearch?: string;
  productType?: string | null;
  attributes: { name: string; key: string; value: string | string[] }[];
}) {
  const fields: ShopifyProductMetafieldInput[] = [];

  if (input.category?.fullName) {
    fields.push({
      namespace: "custom",
      key: "shopify_category",
      type: "single_line_text_field",
      value: input.category.fullName,
    });
  } else if (input.categorySearch) {
    fields.push({
      namespace: "custom",
      key: "shopify_category_hint",
      type: "single_line_text_field",
      value: input.categorySearch,
    });
  }

  if (input.productType) {
    fields.push({
      namespace: "custom",
      key: "product_type_hint",
      type: "single_line_text_field",
      value: input.productType,
    });
  }

  for (const attribute of input.attributes) {
    if (!attribute.key || attribute.key === "product_type_hint") continue;
    fields.push({
      namespace: "custom",
      key: attribute.key,
      type: metafieldType(),
      value: metafieldValue(attribute.value),
    });
  }

  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = `${field.namespace}.${field.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return field.value.length > 0;
  });
}

export async function buildShopifyTaxonomyEnrichment(input: {
  creds: ShopifyCredentials;
  product: ProductForTaxonomyEnrichment;
  context?: StoreContext | null;
  enabled: boolean;
  useAiFallback: boolean;
}): Promise<ShopifyTaxonomyEnrichmentResult> {
  const warnings: string[] = [];
  if (!input.enabled) {
    return { attributes: [], metafields: [], source: "none", warnings };
  }

  const sourceOptions = optionsFromProduct(input.product);
  const sourceCategory = sourceCategorySearch(input.product);
  const sourceAttributes = mergeAttributes(
    input.product.sourceAttributes,
    sourceAttributesFromOptions(input.product)
  );

  let categorySearch = sourceCategory;
  let productType = input.product.productType || null;
  let aiAttributes: { name: string; key: string; value: string | string[] }[] = [];
  let usedAi = false;

  if (
    input.useAiFallback &&
    process.env.GEMINI_API_KEY &&
    (!categorySearch || !productType || sourceAttributes.length === 0)
  ) {
    try {
      const suggestion = await suggestShopifyTaxonomy(
        {
          title: input.product.title,
          descriptionHtml: input.product.descriptionHtml,
          tags: input.product.tags,
          options: sourceOptions,
          sourceCategory,
          sourceAttributes: sourceAttributes.map((attribute) => ({
            name: attribute.name,
            value: Array.isArray(attribute.value)
              ? attribute.value.join(", ")
              : attribute.value,
          })),
        },
        input.context
      );
      categorySearch = categorySearch || suggestion.categorySearch;
      productType = productType || suggestion.productType;
      aiAttributes = suggestion.attributes || [];
      usedAi = true;
    } catch (error) {
      warnings.push(
        `IA de categoria ignorada: ${
          error instanceof Error ? error.message : "falha ao classificar"
        }`
      );
    }
  }

  productType = productType || inferProductType(input.product, sourceCategory) || null;

  const attributes = mergeAttributes(
    sourceAttributes,
    aiAttributes,
    fallbackAttributes(input.product, sourceCategory)
  );
  let category: ShopifyTaxonomyCategoryMatch | null = null;

  if (categorySearch) {
    try {
      const matches = await searchShopifyTaxonomyCategories(
        input.creds,
        categorySearch,
        8
      );
      category =
        matches.find((match) => match.isLeaf) || matches[0] || null;
      if (!category) {
        warnings.push(`Categoria Shopify nao encontrada para "${categorySearch}".`);
      }
    } catch (error) {
      warnings.push(
        `Busca de categoria Shopify falhou: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`
      );
    }
  }

  const metafields = buildMetafields({
    category,
    categorySearch,
    productType,
    attributes,
  });

  return {
    category,
    categorySearch,
    productType,
    attributes,
    metafields,
    source: usedAi && (sourceCategory || sourceAttributes.length) ? "mixed" : usedAi ? "ai" : "source",
    warnings,
  };
}
