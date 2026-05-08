type ProductVariantInput = {
  options?: string[];
} & Record<string, unknown>;

type ProductCreateInput = {
  options?: string[];
  variants?: ProductVariantInput[];
};

const OPTION_NAME_TRANSLATIONS: Record<string, string> = {
  color: "Cor",
  colour: "Cor",
  colors: "Cor",
  colours: "Cor",
  size: "Tamanho",
  sizes: "Tamanho",
  shoesize: "Tamanho do calçado",
  sneakersize: "Tamanho do tênis",
  footwearsize: "Tamanho do calçado",
};

const COLOR_TRANSLATIONS: Record<string, string> = {
  apricot: "Damasco",
  aqua: "Azul aqua",
  beige: "Bege",
  black: "Preto",
  blue: "Azul",
  brown: "Marrom",
  burgundy: "Bordô",
  champagne: "Champanhe",
  clear: "Transparente",
  coffee: "Café",
  darkblue: "Azul escuro",
  darkgray: "Cinza escuro",
  darkgrey: "Cinza escuro",
  gold: "Dourado",
  golden: "Dourado",
  gray: "Cinza",
  green: "Verde",
  grey: "Cinza",
  khaki: "Caqui",
  lavender: "Lavanda",
  lightblue: "Azul claro",
  lightgray: "Cinza claro",
  lightgrey: "Cinza claro",
  mint: "Menta",
  multicolor: "Colorido",
  navy: "Azul marinho",
  orange: "Laranja",
  pink: "Rosa",
  purple: "Roxo",
  red: "Vermelho",
  rose: "Rosa",
  rosegold: "Rosê",
  silver: "Prata",
  transparent: "Transparente",
  white: "Branco",
  wine: "Vinho",
  yellow: "Amarelo",
};

const SIZE_TRANSLATIONS: Record<string, string> = {
  "2xlarge": "XGG",
  "2xl": "XGG",
  "3xlarge": "XGGG",
  "3xl": "XGGG",
  "4xlarge": "4G",
  "4xl": "4G",
  "5xlarge": "5G",
  "5xl": "5G",
  extraextraextralarge: "XGGG",
  extraextralarge: "XGG",
  extralarge: "GG",
  extrasmall: "PP",
  large: "G",
  l: "G",
  medium: "M",
  m: "M",
  one: "Tamanho único",
  onesize: "Tamanho único",
  one_size: "Tamanho único",
  small: "P",
  s: "P",
  xl: "GG",
  xlarge: "GG",
  xs: "PP",
  xsmall: "PP",
  xxl: "XGG",
  xxxl: "XGGG",
};

function normalizeKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

function isMeasurement(value: string) {
  return /\d/.test(value) && /(cm|mm|m|inch|in|kg|g|ml|oz|w|v|us|eu|br)/i.test(value);
}

function looksAlreadyPortuguese(value: string) {
  const normalized = normalizeKey(value);
  return [
    "azul",
    "branco",
    "preto",
    "vermelho",
    "verde",
    "amarelo",
    "rosa",
    "roxo",
    "cinza",
    "marrom",
    "bege",
    "dourado",
    "prata",
    "tamanhounico",
  ].includes(normalized);
}

function optionKind(optionName?: string) {
  const key = normalizeKey(optionName || "");
  if (["color", "colour", "colors", "colours", "cor", "cores"].includes(key)) {
    return "color";
  }
  if (
    [
      "shoesize",
      "sneakersize",
      "footwearsize",
      "calcado",
      "calcados",
      "tenis",
      "tamanhodocalcado",
      "tamanhodotenis",
    ].includes(key) ||
    key.includes("shoe") ||
    key.includes("sneaker") ||
    key.includes("footwear")
  ) {
    return "shoe-size";
  }
  if (["size", "sizes", "tamanho", "tamanhos", "tam"].includes(key)) {
    return "size";
  }
  return "unknown";
}

function formatShoeSize(target: "US" | "EU", sourceSize: number, brSize: number) {
  const normalizedSource = Number.isInteger(sourceSize)
    ? String(sourceSize)
    : sourceSize.toFixed(1).replace(/\.0$/, "");
  const normalizedBr = Number.isInteger(brSize)
    ? String(brSize)
    : brSize.toFixed(1).replace(/\.0$/, "");

  return `BR ${normalizedBr} (${target} ${normalizedSource})`;
}

function translateShoeSizeToPortuguese(value: string, optionName?: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const explicitWomen = /\b(w|women|woman|female|feminino|fem)\b/i.test(lower);
  const explicitMen = /\b(m|men|man|male|masculino|masc)\b/i.test(lower);
  const usPrefixMatch = lower.match(
    /\bus\s*(m|men|w|women)?\s*([0-9]+(?:[.,]5)?)/i
  );
  const usSuffixMatch = lower.match(
    /([0-9]+(?:[.,]5)?)\s*us\s*(m|men|w|women)?\b/i
  );
  const usMatch = usPrefixMatch || usSuffixMatch;
  if (usMatch) {
    const rawSizeText = usPrefixMatch ? usMatch[2] : usMatch[1];
    const rawGender = normalizeKey(usPrefixMatch ? usMatch[1] || "" : usMatch[2] || "");
    const rawSize = Number(rawSizeText.replace(",", "."));
    if (Number.isFinite(rawSize)) {
      const women = explicitWomen || rawGender === "w" || rawGender === "women";
      const men = explicitMen || rawGender === "m" || rawGender === "men";
      const brSize = women && !men ? rawSize + 30 : rawSize + 32;
      return formatShoeSize("US", rawSize, brSize);
    }
  }

  const euMatch =
    lower.match(/\beu(?:r)?\s*([0-9]+(?:[.,]5)?)/i) ||
    lower.match(/([0-9]+(?:[.,]5)?)\s*eu(?:r)?\b/i);
  if (euMatch) {
    const rawSize = Number((euMatch[1] || "").replace(",", "."));
    if (Number.isFinite(rawSize)) {
      return formatShoeSize("EU", rawSize, rawSize - 2);
    }
  }

  const kind = optionKind(optionName);
  const numericOnly = trimmed.match(/^[0-9]+(?:[.,]5)?$/);
  if (kind === "shoe-size" && numericOnly) {
    return `BR ${trimmed}`;
  }

  return value;
}

export function translateOptionNameToPortuguese(value: string) {
  return OPTION_NAME_TRANSLATIONS[normalizeKey(value)] || value;
}

export function translateOptionValueToPortuguese(
  value: string,
  optionName?: string
) {
  const trimmed = value.trim();
  if (!trimmed || looksAlreadyPortuguese(trimmed)) {
    return value;
  }

  const key = normalizeKey(trimmed);
  const kind = optionKind(optionName);

  if (
    kind === "shoe-size" ||
    /\bus\b/i.test(trimmed) ||
    /\beur?\b/i.test(trimmed)
  ) {
    const translatedShoeSize = translateShoeSizeToPortuguese(value, optionName);
    if (translatedShoeSize !== value) return translatedShoeSize;
  }

  if (isMeasurement(trimmed)) {
    return value;
  }

  if (kind === "size") {
    return SIZE_TRANSLATIONS[key] || value;
  }

  if (kind === "color") {
    return COLOR_TRANSLATIONS[key] || value;
  }

  return COLOR_TRANSLATIONS[key] || SIZE_TRANSLATIONS[key] || value;
}

export function translateProductVariantOptionsToPortuguese<T extends ProductCreateInput>(
  input: T
): T {
  const optionNames = input.options || [];
  if (optionNames.length === 0 && !input.variants?.some((variant) => variant.options?.length)) {
    return input;
  }

  const translatedOptions = optionNames.map(translateOptionNameToPortuguese);

  return {
    ...input,
    options: input.options ? translatedOptions : input.options,
    variants: input.variants?.map((variant) => ({
      ...variant,
      options: variant.options?.map((value, index) =>
        translateOptionValueToPortuguese(value, optionNames[index])
      ),
    })),
  };
}
