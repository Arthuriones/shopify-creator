const SHOPIFY_MYSHOPIFY_DOMAIN_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.myshopify\.com$/i;

function extractHostname(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;

  const hasProtocol = /^[a-z]+:\/\//.test(value);
  const looksLikeUrlWithoutProtocol =
    value.includes("/") || value.includes("?") || value.includes("#");

  if (!hasProtocol && looksLikeUrlWithoutProtocol) {
    value = `https://${value}`;
  }

  if (/^[a-z]+:\/\//.test(value)) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  return value.replace(/\.+$/, "");
}

export function normalizeShopDomain(input: string): string | null {
  const hostname = extractHostname(input);
  if (!hostname) return null;

  return SHOPIFY_MYSHOPIFY_DOMAIN_REGEX.test(hostname) ? hostname : null;
}
