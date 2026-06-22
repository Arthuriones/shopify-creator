import { normalizeShopDomain } from "@/lib/shopify/domain";

export interface CheckoutRouteLine {
  sku?: string;
  sourceVariantId?: string | number;
  targetVariantId?: string | number;
  quantity?: number;
}

export interface CheckoutRouteMaps {
  skuMap?: Record<string, string | number>;
  variantMap?: Record<string, string | number>;
}

function numericVariantId(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const match = String(value).match(/(\d+)$/);
  return match?.[1] || null;
}

function variantLookupKeys(value: string | number | undefined): string[] {
  if (value === undefined || value === null || value === "") return [];
  const raw = String(value);
  const numeric = numericVariantId(value);
  return [
    raw,
    numeric ? `gid://shopify/ProductVariant/${numeric}` : "",
    numeric || "",
  ].filter((key, index, keys) => key && keys.indexOf(key) === index);
}

function lookupVariantMap(
  map: Record<string, string | number> | undefined,
  value: string | number | undefined
) {
  if (!map) return undefined;
  for (const key of variantLookupKeys(value)) {
    if (map[key] !== undefined) return map[key];
  }
  return undefined;
}

export function resolveCheckoutLines(
  lines: CheckoutRouteLine[],
  maps: CheckoutRouteMaps
) {
  return resolveCheckoutLinesDetailed(lines, maps)
    .filter((line) => line.variantId)
    .map((line) => ({ variantId: line.variantId as string, quantity: line.quantity }));
}

export interface ResolvedLineDetail {
  quantity: number;
  sku: string;
  variantId: string | null;
}

// Igual ao resolveCheckoutLines, mas devolve TODAS as linhas (resolvidas ou
// nao) com o SKU, para o chamador tentar um fallback (ex.: resolver por SKU no
// products.json publico da dark store quando o mapa nao cobre a variante).
export function resolveCheckoutLinesDetailed(
  lines: CheckoutRouteLine[],
  maps: CheckoutRouteMaps
): ResolvedLineDetail[] {
  // Indice do sku_map em minusculas para casar SKU sem depender de caixa.
  const lowerSkuMap: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(maps.skuMap || {})) {
    const lower = key.trim().toLowerCase();
    if (lower && lowerSkuMap[lower] === undefined) lowerSkuMap[lower] = value;
  }

  return lines.map((line) => {
    const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)));
    const skuKey = String(line.sku || "").trim();
    const skuLower = skuKey.toLowerCase();
    const mapped =
      line.targetVariantId ||
      lookupVariantMap(maps.variantMap, line.sourceVariantId) ||
      (skuKey ? maps.skuMap?.[skuKey] ?? lowerSkuMap[skuLower] : undefined);
    return { quantity, sku: skuKey, variantId: numericVariantId(mapped) };
  });
}

export function buildCartPermalink(
  targetDomain: string,
  lines: { variantId: string; quantity: number }[],
  attributes?: Record<string, string>
) {
  const domain = normalizeShopDomain(targetDomain);
  if (!domain) {
    throw new Error("Dominio de checkout invalido.");
  }
  if (lines.length === 0) {
    throw new Error("Nenhum item pode ser roteado para o checkout.");
  }

  const cartPath = lines
    .map((line) => `${line.variantId}:${line.quantity}`)
    .join(",");
  const url = new URL(`https://${domain}/cart/${cartPath}`);

  for (const [key, value] of Object.entries(attributes || {})) {
    if (key && value) url.searchParams.set(`attributes[${key}]`, value);
  }

  return url.toString();
}
