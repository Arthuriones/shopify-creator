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

export function resolveCheckoutLines(
  lines: CheckoutRouteLine[],
  maps: CheckoutRouteMaps
) {
  return lines
    .map((line) => {
      const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)));
      const sourceKey = String(line.sourceVariantId || "");
      const skuKey = String(line.sku || "").trim();
      const mapped =
        line.targetVariantId ||
        (sourceKey ? maps.variantMap?.[sourceKey] : undefined) ||
        (skuKey ? maps.skuMap?.[skuKey] : undefined);
      const variantId = numericVariantId(mapped);

      return variantId ? { variantId, quantity } : null;
    })
    .filter((line): line is { variantId: string; quantity: number } =>
      Boolean(line)
    );
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
