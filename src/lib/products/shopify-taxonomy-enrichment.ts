import { suggestShopifyTaxonomy } from "@/lib/gemini/client";
import {
  getShopifyCategoryMetafieldData,
  searchShopifyTaxonomyCategories,
  type ShopifyCredentials,
  type ShopifyProductMetafieldInput,
  type ShopifyStandardMetafieldTemplate,
  type ShopifyTaxonomyAttributeMatch,
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
  images?: (
    | string
    | {
        url?: string | null;
        src?: string | null;
        altText?: string | null;
      }
  )[];
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
  "genero alvo": { key: "gender", name: "Genero" },
  "target gender": { key: "gender", name: "Genero" },
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
  idade: { key: "age_group", name: "Faixa etaria" },
  "faixa etaria": { key: "age_group", name: "Faixa etaria" },
  "age group": { key: "age_group", name: "Faixa etaria" },
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

const GOOGLE_SHOPPING_NAMESPACE = "mm-google-shopping";

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
  } else if (
    /\b(apparel|accessories|clothing|clothes|shirt|shirts|t-?shirt|pants|trousers|shorts|dress|dresses|coat|coats|jacket|jackets|shoe|shoes|sneaker|sneakers|jewelry|bracelet|necklace|ring|earring|watch|vestuario|vestu[aá]rio|acessorios|acess[oó]rios|roupa|roupas|camisa|camiseta|calca|cal[cç]a|shorts|vestido|casaco|jaqueta|calcado|cal[cç]ado|tenis|t[eê]nis|joia|j[oó]ia|pulseira|colar|anel|brinco|relogio|rel[oó]gio)\b/.test(
      text
    )
  ) {
    attributes.push({ name: "Faixa etaria", key: "age_group", value: "Adulto" });
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

function primaryProductImageUrl(product: ProductForTaxonomyEnrichment) {
  const firstImage = product.images?.find((image) => {
    if (typeof image === "string") return Boolean(image.trim());
    return Boolean(image?.url || image?.src);
  });

  if (!firstImage) return null;
  return typeof firstImage === "string"
    ? firstImage
    : firstImage.url || firstImage.src || null;
}

function mergeTaxonomyAttributes(input: {
  preferAi: boolean;
  sourceAttributes: { name: string; key: string; value: string | string[] }[];
  aiAttributes: { name: string; key: string; value: string | string[] }[];
  fallbackAttributes: { name: string; key: string; value: string | string[] }[];
}) {
  return input.preferAi
    ? mergeAttributes(
        input.aiAttributes,
        input.sourceAttributes,
        input.fallbackAttributes
      )
    : mergeAttributes(
        input.sourceAttributes,
        input.aiAttributes,
        input.fallbackAttributes
      );
}

function metafieldValue(value: string | string[]) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function metafieldType() {
  return "single_line_text_field";
}

function attributeValueList(attribute: { value: string | string[] }) {
  return (Array.isArray(attribute.value) ? attribute.value : String(attribute.value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function attributeValuesByKey(
  attributes: { key: string; value: string | string[] }[],
  key: string
) {
  return attributes
    .filter((attribute) => normalizeKey(attribute.key) === key)
    .flatMap(attributeValueList);
}

function firstMatchingGoogleValue(
  values: string[],
  matches: { value: string; patterns: RegExp[] }[]
) {
  const textValues = values.map((value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
  );

  for (const match of matches) {
    if (
      textValues.some((value) =>
        match.patterns.some((pattern) => pattern.test(value))
      )
    ) {
      return match.value;
    }
  }

  return null;
}

function googleShoppingGender(attributes: { key: string; value: string | string[] }[]) {
  return firstMatchingGoogleValue(attributeValuesByKey(attributes, "gender"), [
    { value: "female", patterns: [/\bfemale\b/, /\bwomen'?s?\b/, /\bfeminino\b/, /\bfeminina\b/, /\bmulher\b/] },
    { value: "male", patterns: [/\bmale\b/, /\bmen'?s?\b/, /\bmasculino\b/, /\bhomem\b/] },
    { value: "unisex", patterns: [/\bunisex\b/, /\bunissex\b/] },
  ]);
}

function googleShoppingAgeGroup(attributes: { key: string; value: string | string[] }[]) {
  return firstMatchingGoogleValue(attributeValuesByKey(attributes, "age_group"), [
    { value: "adult", patterns: [/\badult\b/, /\badults\b/, /\badulto\b/, /\badultos\b/] },
    { value: "kids", patterns: [/\bkids?\b/, /\bchildren\b/, /\bchild\b/, /\binfantil\b/, /\bcrianca\b/, /\bcriancas\b/] },
    { value: "infant", patterns: [/\binfant\b/, /\bbaby\b/, /\bbebe\b/] },
    { value: "toddler", patterns: [/\btoddler\b/] },
    { value: "newborn", patterns: [/\bnewborn\b/, /\brecem nascido\b/] },
  ]);
}

function buildGoogleShoppingMetafields(input: {
  attributes: { key: string; value: string | string[] }[];
}) {
  const fields: ShopifyProductMetafieldInput[] = [];
  const ageGroup = googleShoppingAgeGroup(input.attributes);
  const gender = googleShoppingGender(input.attributes);

  if (ageGroup) {
    fields.push({
      namespace: GOOGLE_SHOPPING_NAMESPACE,
      key: "age_group",
      type: metafieldType(),
      value: ageGroup,
      label: "Google Shopping: age_group",
      displayValue: ageGroup,
    });
  }

  if (gender) {
    fields.push({
      namespace: GOOGLE_SHOPPING_NAMESPACE,
      key: "gender",
      type: metafieldType(),
      value: gender,
      label: "Google Shopping: gender",
      displayValue: gender,
    });
  }

  return fields;
}

function uniqueMetafields(fields: ShopifyProductMetafieldInput[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = `${field.namespace}.${field.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return field.value.length > 0;
  });
}

function normalizedToken(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedCompact(input: string) {
  return normalizedToken(input).replace(/\s+/g, "");
}

function productCategorySignal(input: {
  product: ProductForTaxonomyEnrichment;
  categorySearch?: string;
  productType?: string | null;
  attributes?: { name: string; key: string; value: string | string[] }[];
}) {
  return normalizedToken(
    [
      input.product.title,
      input.product.descriptionHtml?.replace(/<[^>]+>/g, " "),
      input.product.productType,
      input.product.sourceCategory,
      input.categorySearch,
      input.productType,
      input.product.tags?.join(" "),
      ...(input.attributes || []).flatMap((attribute) => [
        attribute.name,
        Array.isArray(attribute.value)
          ? attribute.value.join(" ")
          : String(attribute.value || ""),
      ]),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function addUniqueSearchTerm(terms: string[], value?: string | null) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;
  const key = normalizedCompact(clean);
  if (key && !terms.some((term) => normalizedCompact(term) === key)) {
    terms.push(clean);
  }
}

function categorySearchTerms(input: {
  product: ProductForTaxonomyEnrichment;
  categorySearch?: string;
  productType?: string | null;
  attributes: { name: string; key: string; value: string | string[] }[];
}) {
  const terms: string[] = [];
  addUniqueSearchTerm(terms, input.categorySearch);
  addUniqueSearchTerm(terms, input.productType);

  const signal = productCategorySignal(input);
  const isWomen = hasAny(signal, ["women", "womens", "female", "feminino", "feminina", "mulher"]);
  const isMen = hasAny(signal, ["men", "mens", "male", "masculino", "homem"]);
  const isSnow =
    hasAny(signal, ["snow", "snowboard", "ski", "inverno", "insulated"]) &&
    hasAny(signal, ["jacket", "jaqueta", "coat", "casaco", "pants", "calca", "trousers"]);

  if (hasAny(signal, ["jacket", "jaqueta", "coat", "casaco"])) {
    if (isWomen) {
      addUniqueSearchTerm(terms, "Women's Jackets");
      addUniqueSearchTerm(terms, "Women's Coats & Jackets");
    } else if (isMen) {
      addUniqueSearchTerm(terms, "Men's Jackets");
      addUniqueSearchTerm(terms, "Men's Coats & Jackets");
    }
    if (isSnow) {
      if (isWomen) addUniqueSearchTerm(terms, "Women's Snow Jackets");
      if (isMen) addUniqueSearchTerm(terms, "Men's Snow Jackets");
      addUniqueSearchTerm(terms, "Snow Jackets");
      addUniqueSearchTerm(terms, "Ski Jackets");
      addUniqueSearchTerm(terms, "Winter Jackets");
    }
    addUniqueSearchTerm(terms, "Coats & Jackets");
    addUniqueSearchTerm(terms, "Jackets");
  }

  if (hasAny(signal, ["pants", "trousers", "calca", "calcas"])) {
    if (isWomen) addUniqueSearchTerm(terms, "Women's Pants");
    if (isMen) addUniqueSearchTerm(terms, "Men's Pants");
    if (isSnow) {
      if (isWomen) addUniqueSearchTerm(terms, "Women's Snow Pants");
      if (isMen) addUniqueSearchTerm(terms, "Men's Snow Pants");
      addUniqueSearchTerm(terms, "Snow Pants");
      addUniqueSearchTerm(terms, "Ski Pants");
      addUniqueSearchTerm(terms, "Snowboard Pants");
    }
    addUniqueSearchTerm(terms, "Pants");
  }

  if (hasAny(signal, ["bracelet", "pulseira"])) addUniqueSearchTerm(terms, "Bracelets");
  if (hasAny(signal, ["necklace", "colar"])) addUniqueSearchTerm(terms, "Necklaces");
  if (hasAny(signal, ["ring", "anel", "aneis"])) addUniqueSearchTerm(terms, "Rings");
  if (hasAny(signal, ["shoes", "sneakers", "tenis", "calcado", "calcados"])) {
    addUniqueSearchTerm(terms, "Shoes");
  }

  return terms.slice(0, 7);
}

function categoryCompatibilityScore(
  category: ShopifyTaxonomyCategoryMatch,
  input: {
    product: ProductForTaxonomyEnrichment;
    categorySearch?: string;
    productType?: string | null;
    attributes: { name: string; key: string; value: string | string[] }[];
  }
) {
  const signal = productCategorySignal(input);
  const categoryText = normalizedToken(`${category.fullName} ${category.name}`);
  let score = category.isLeaf ? 10 : 0;

  const categoryTokens = normalizedToken(input.categorySearch || "")
    .split(" ")
    .filter((token) => token.length > 2);
  for (const token of categoryTokens) {
    if (categoryText.includes(token)) score += 3;
  }

  const clothingSignal = hasAny(signal, [
    "jacket",
    "jaqueta",
    "coat",
    "casaco",
    "pants",
    "trousers",
    "calca",
    "shirt",
    "camisa",
    "dress",
    "vestido",
  ]);
  const underwearCategory = hasAny(categoryText, [
    "lingerie",
    "underwear",
    "undershirt",
    "underpants",
    "panties",
    "bras",
  ]);
  const underwearSignal = hasAny(signal, [
    "lingerie",
    "underwear",
    "undershirt",
    "underpants",
    "panties",
    "sutia",
    "calcinha",
    "cueca",
  ]);

  if (underwearCategory && clothingSignal && !underwearSignal) score -= 140;

  const childCategory = hasAny(categoryText, [
    "baby",
    "babies",
    "children",
    "childrens",
    "child",
    "kids",
    "kid",
    "toddler",
    "toddlers",
    "infant",
    "infants",
  ]);
  const childSignal = hasAny(signal, [
    "baby",
    "bebe",
    "infant",
    "infantil",
    "children",
    "child",
    "kids",
    "kid",
    "crianca",
    "criancas",
    "toddler",
    "junior",
  ]);
  const adultSignal = hasAny(signal, ["adult", "adults", "adulto", "adultos"]);
  const womenSignal = hasAny(signal, ["women", "womens", "female", "feminino", "feminina", "mulher"]);
  const menSignal = hasAny(signal, ["men", "mens", "male", "masculino", "homem"]);

  if (childCategory && !childSignal) {
    score -= adultSignal ? 220 : 120;
    if (womenSignal || menSignal) score -= 90;
    if (clothingSignal) score -= 40;
  }

  if (!childCategory && childSignal) {
    score -= 30;
  }

  if (hasAny(signal, ["jacket", "jaqueta", "coat", "casaco"])) {
    if (hasAny(categoryText, ["jacket", "jackets", "coat", "coats", "outerwear"])) {
      score += 90;
    }
    if (hasAny(categoryText, ["shirt", "shirts", "tops", "blouse"])) score -= 55;
    if (hasAny(categoryText, ["pants", "trousers", "shorts"])) score -= 35;
  }

  if (hasAny(signal, ["snow", "snowboard", "ski", "inverno", "insulated"])) {
    if (hasAny(categoryText, ["snow", "ski", "winter", "outerwear", "jacket", "coat"])) {
      score += 30;
    }
    if (underwearCategory) score -= 80;
  }

  if (hasAny(signal, ["pants", "trousers", "calca", "calcas"])) {
    if (hasAny(categoryText, ["pants", "trousers", "bottoms"])) score += 85;
    if (hasAny(categoryText, ["shirt", "shirts", "jacket", "coat"])) score -= 35;
  }

  if (womenSignal) {
    if (hasAny(categoryText, ["women", "womens", "female"])) score += 10;
    if (hasAny(categoryText, ["men", "mens", "male"]) && !hasAny(categoryText, ["women"])) {
      score -= 45;
    }
  }

  if (menSignal) {
    if (hasAny(categoryText, ["men", "mens", "male"])) score += 10;
    if (hasAny(categoryText, ["women", "womens", "female"])) score -= 45;
  }

  return score;
}

function hasAudienceConflict(
  category: ShopifyTaxonomyCategoryMatch,
  input: {
    product: ProductForTaxonomyEnrichment;
    categorySearch?: string;
    productType?: string | null;
    attributes: { name: string; key: string; value: string | string[] }[];
  }
) {
  const signal = productCategorySignal(input);
  const categoryText = normalizedToken(`${category.fullName} ${category.name}`);
  const childCategory = hasAny(categoryText, [
    "baby",
    "babies",
    "children",
    "childrens",
    "child",
    "kids",
    "kid",
    "toddler",
    "toddlers",
    "infant",
    "infants",
  ]);
  const childSignal = hasAny(signal, [
    "baby",
    "bebe",
    "infant",
    "infantil",
    "children",
    "child",
    "kids",
    "kid",
    "crianca",
    "criancas",
    "toddler",
    "junior",
  ]);
  const adultSignal = hasAny(signal, ["adult", "adults", "adulto", "adultos"]);
  const womenSignal = hasAny(signal, [
    "women",
    "womens",
    "female",
    "feminino",
    "feminina",
    "mulher",
  ]);
  const menSignal = hasAny(signal, ["men", "mens", "male", "masculino", "homem"]);
  const clothingSignal = hasAny(signal, [
    "jacket",
    "jaqueta",
    "coat",
    "casaco",
    "pants",
    "trousers",
    "calca",
    "shirt",
    "camisa",
    "dress",
    "vestido",
    "outerwear",
    "clothing",
    "roupa",
  ]);

  if (
    childCategory &&
    !childSignal &&
    (adultSignal || womenSignal || menSignal || clothingSignal)
  ) {
    return true;
  }

  if (
    womenSignal &&
    hasAny(categoryText, ["men", "mens", "male"]) &&
    !hasAny(categoryText, ["women", "womens", "female"])
  ) {
    return true;
  }

  if (menSignal && hasAny(categoryText, ["women", "womens", "female"])) {
    return true;
  }

  return false;
}

async function findBestShopifyCategory(input: {
  creds: ShopifyCredentials;
  product: ProductForTaxonomyEnrichment;
  categorySearch?: string;
  productType?: string | null;
  attributes: { name: string; key: string; value: string | string[] }[];
}) {
  const searches = categorySearchTerms(input);
  const byId = new Map<string, ShopifyTaxonomyCategoryMatch>();

  for (const search of searches) {
    const matches = await searchShopifyTaxonomyCategories(input.creds, search, 15);
    for (const match of matches) {
      if (!byId.has(match.id)) byId.set(match.id, match);
    }
  }

  const allCandidates = Array.from(byId.values());
  const compatibleCandidates = allCandidates.filter(
    (category) => !hasAudienceConflict(category, input)
  );
  const scored = compatibleCandidates
    .map((category) => ({
      category,
      score: categoryCompatibilityScore(category, input),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    category: scored[0]?.category || null,
    score: scored[0]?.score ?? 0,
    searched: searches,
    audienceConflictCount: allCandidates.length - compatibleCandidates.length,
    rejected:
      scored[0]?.score !== undefined && scored[0].score < 0
        ? scored[0].category.fullName
        : null,
  };
}

const VALUE_SYNONYMS: Record<string, string[]> = {
  feminino: ["female", "women", "womens"],
  feminina: ["female", "women", "womens"],
  mulher: ["female", "women", "womens"],
  masculino: ["male", "men", "mens"],
  homem: ["male", "men", "mens"],
  unissex: ["unisex"],
  unisex: ["unisex"],
  adulto: ["adult", "adults"],
  adultos: ["adult", "adults"],
  infantil: ["kids", "children", "child"],
  crianca: ["kids", "children", "child"],
  criancas: ["kids", "children", "child"],
  bebe: ["baby", "infant"],
  preto: ["black"],
  branca: ["white"],
  branco: ["white"],
  azul: ["blue"],
  vermelho: ["red"],
  vermelha: ["red"],
  verde: ["green"],
  amarelo: ["yellow"],
  amarela: ["yellow"],
  rosa: ["pink"],
  roxo: ["purple"],
  roxa: ["purple"],
  cinza: ["gray", "grey"],
  prata: ["silver"],
  prateado: ["silver"],
  prateada: ["silver"],
  dourado: ["gold"],
  dourada: ["gold"],
  marrom: ["brown"],
  bege: ["beige"],
};

const ATTRIBUTE_TEMPLATE_HINTS: Record<string, string[]> = {
  gender: ["target gender", "gender", "targetgender", "target-gender"],
  age_group: ["age group", "agegroup", "age-group", "recommended age group"],
  color: ["color", "colour", "color pattern", "color-pattern"],
  pattern: ["pattern", "color pattern", "color-pattern"],
  material: ["material", "fabric", "jewelry material", "clothing material"],
  size: ["size"],
  product_subtype: ["type", "jewelry type", "clothing type", "product type"],
};

function templateMatchesAttribute(
  template: ShopifyStandardMetafieldTemplate,
  attribute: { name: string; key: string }
) {
  const haystack = [
    template.name,
    template.key,
    template.namespace,
    `${template.namespace}.${template.key}`,
  ].map(normalizedCompact);
  const hints = [
    attribute.key,
    attribute.name,
    ...(ATTRIBUTE_TEMPLATE_HINTS[attribute.key] || []),
  ].map(normalizedCompact);

  return hints.some((hint) =>
    haystack.some((candidate) => candidate.includes(hint) || hint.includes(candidate))
  );
}

function valueCandidates(value: string) {
  const normalized = normalizedToken(value);
  const compact = normalizedCompact(value);
  const synonyms = VALUE_SYNONYMS[compact] || VALUE_SYNONYMS[normalized] || [];
  return [normalized, compact, ...synonyms.map(normalizedToken), ...synonyms.map(normalizedCompact)];
}

function attributeValues(attribute: { value: string | string[] }) {
  return Array.isArray(attribute.value)
    ? attribute.value
    : String(attribute.value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function matchTaxonomyValue(
  attribute: ShopifyTaxonomyAttributeMatch | undefined,
  value: string
) {
  if (!attribute) return null;
  const candidates = valueCandidates(value);
  return (
    attribute.values.find((taxonomyValue) => {
      const normalizedName = normalizedToken(taxonomyValue.name);
      const compactName = normalizedCompact(taxonomyValue.name);
      return candidates.some(
        (candidate) =>
          candidate === normalizedName ||
          candidate === compactName ||
          normalizedName.includes(candidate) ||
          compactName.includes(candidate)
      );
    }) || null
  );
}

function taxonomyAttributeMatchesTemplate(
  taxonomyAttribute: ShopifyTaxonomyAttributeMatch,
  template: ShopifyStandardMetafieldTemplate
) {
  const taxonomyName = normalizedCompact(taxonomyAttribute.name);
  const templateName = normalizedCompact(template.name);
  const templateKey = normalizedCompact(template.key);
  const hintMatches = Object.entries(ATTRIBUTE_TEMPLATE_HINTS).some(
    ([key, hints]) =>
      templateMatchesAttribute(template, { key, name: key }) &&
      [key, ...hints].map(normalizedCompact).some((hint) =>
        taxonomyName.includes(hint) || hint.includes(taxonomyName)
      )
  );

  return (
    hintMatches ||
    templateName.includes(taxonomyName) ||
    taxonomyName.includes(templateName) ||
    templateKey.includes(taxonomyName) ||
    taxonomyName.includes(templateKey)
  );
}

async function buildStandardCategoryMetafields(input: {
  creds: ShopifyCredentials;
  category: ShopifyTaxonomyCategoryMatch | null;
  attributes: { name: string; key: string; value: string | string[] }[];
}) {
  if (!input.category?.id) return [] as ShopifyProductMetafieldInput[];

  const { attributes: taxonomyAttributes, templates } =
    await getShopifyCategoryMetafieldData(input.creds, input.category.id);
  const fields: ShopifyProductMetafieldInput[] = [];

  for (const attribute of input.attributes) {
    const template = templates.find((candidate) =>
      templateMatchesAttribute(candidate, attribute)
    );
    if (!template) continue;

    const taxonomyAttribute = taxonomyAttributes.find((candidate) =>
      taxonomyAttributeMatchesTemplate(candidate, template)
    );
    const values = attributeValues(attribute);

    if (template.type.includes("product_taxonomy_value_reference")) {
      const matchedValues = values
        .map((value) => matchTaxonomyValue(taxonomyAttribute, value))
        .filter(
          (value): value is { id: string; name: string } =>
            Boolean(value?.id && value.name)
        );
      const matchedIds = matchedValues.map((value) => value.id);
      if (matchedIds.length === 0) continue;

      fields.push({
        namespace: template.namespace,
        key: template.key,
        type: template.type,
        value: template.type.startsWith("list.")
          ? JSON.stringify([...new Set(matchedIds)])
          : matchedIds[0],
        label: template.name || attribute.name,
        displayValue: [...new Set(matchedValues.map((value) => value.name))].join(", "),
        definitionTemplateId: template.id,
      });
      continue;
    }

    fields.push({
      namespace: template.namespace,
      key: template.key,
      type: template.type || "single_line_text_field",
      value: values.join(", "),
      label: template.name || attribute.name,
      displayValue: values.join(", "),
      definitionTemplateId: template.id,
    });
  }

  return uniqueMetafields(fields);
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
      label: "Categoria Shopify",
      displayValue: input.category.fullName,
    });
  } else if (input.categorySearch) {
    fields.push({
      namespace: "custom",
      key: "shopify_category_hint",
      type: "single_line_text_field",
      value: input.categorySearch,
      label: "Categoria sugerida",
      displayValue: input.categorySearch,
    });
  }

  if (input.productType) {
    fields.push({
      namespace: "custom",
      key: "product_type_hint",
      type: "single_line_text_field",
      value: input.productType,
      label: "Tipo sugerido",
      displayValue: input.productType,
    });
  }

  for (const attribute of input.attributes) {
    if (!attribute.key || attribute.key === "product_type_hint") continue;
    fields.push({
      namespace: "custom",
      key: attribute.key,
      type: metafieldType(),
      value: metafieldValue(attribute.value),
      label: attribute.name,
      displayValue: metafieldValue(attribute.value),
    });
  }

  return uniqueMetafields(fields);
}

export async function buildShopifyTaxonomyEnrichment(input: {
  creds: ShopifyCredentials;
  product: ProductForTaxonomyEnrichment;
  context?: StoreContext | null;
  enabled: boolean;
  useAiFallback: boolean;
  preferAiCategory?: boolean;
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
  const canUseAi = input.useAiFallback && Boolean(process.env.GEMINI_API_KEY);
  const preferAiCategory = canUseAi && input.preferAiCategory === true;

  let categorySearch = preferAiCategory ? "" : sourceCategory;
  let productType = preferAiCategory ? null : input.product.productType || null;
  let aiAttributes: { name: string; key: string; value: string | string[] }[] = [];
  let usedAi = false;

  if (
    canUseAi &&
    (preferAiCategory || !categorySearch || !productType || sourceAttributes.length === 0)
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
          sourceCategoryTrusted: !preferAiCategory,
          imageUrl: primaryProductImageUrl(input.product),
        },
        input.context
      );
      categorySearch = suggestion.categorySearch || categorySearch;
      productType = suggestion.productType || productType;
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

  const attributes = mergeTaxonomyAttributes({
    preferAi: preferAiCategory,
    sourceAttributes,
    aiAttributes,
    fallbackAttributes: fallbackAttributes(input.product, sourceCategory),
  });
  let category: ShopifyTaxonomyCategoryMatch | null = null;

  if (categorySearch) {
    try {
      const matchResult = await findBestShopifyCategory({
        creds: input.creds,
        product: input.product,
        categorySearch,
        productType,
        attributes,
      });
      category = matchResult.category;
      if (!category) {
        warnings.push(
          matchResult.audienceConflictCount > 0
            ? `Categoria Shopify nao encontrada sem conflito de publico para "${categorySearch}". ${matchResult.audienceConflictCount} candidato(s) infantil/masculino/feminino foram descartados.`
            : `Categoria Shopify nao encontrada para "${categorySearch}".`
        );
      } else if (matchResult.score < 0) {
        category = null;
        warnings.push(
          `Categoria Shopify suspeita ignorada/revisar: "${matchResult.rejected}". Buscas: ${matchResult.searched.join(", ")}.`
        );
      }
    } catch (error) {
      warnings.push(
        `Busca de categoria Shopify falhou: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`
      );
    }
  }

  let metafields: ShopifyProductMetafieldInput[] = [];
  try {
    metafields = await buildStandardCategoryMetafields({
      creds: input.creds,
      category,
      attributes,
    });
    if (category?.id && attributes.length > 0 && metafields.length === 0) {
      warnings.push(
        "Nenhum metacampo padrao de categoria foi encontrado com valor compativel."
      );
    }
  } catch (error) {
    warnings.push(
      `Metacampos padrao da Shopify ignorados: ${
        error instanceof Error ? error.message : "falha ao mapear metacampos"
      }`
    );
  }

  if (metafields.length === 0) {
    metafields = buildMetafields({
      category,
      categorySearch,
      productType,
      attributes,
    });
  }

  metafields = uniqueMetafields([
    ...metafields,
    ...buildGoogleShoppingMetafields({ attributes }),
  ]);

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
