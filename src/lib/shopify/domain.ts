const SHOPIFY_MYSHOPIFY_DOMAIN_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.myshopify\.com$/i;

const GENERAL_DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function extractHostname(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // Remove protocolo se existir
  const hasProtocol = /^[a-z]+:\/\//.test(value);
  if (hasProtocol) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  } else {
    // Se nao tem protocolo mas tem caminhos, tenta tratar como URL
    const looksLikeUrlWithoutProtocol =
      value.includes("/") || value.includes("?") || value.includes("#");
    
    if (looksLikeUrlWithoutProtocol) {
      try {
        value = new URL(`https://${value}`).hostname.toLowerCase();
      } catch {
        // Fallback: apenas pega a parte antes da primeira barra
        value = value.split(/[/?#]/)[0];
      }
    }
  }

  return value.replace(/\.+$/, "");
}

export function normalizeShopDomain(input: string): string | null {
  const hostname = extractHostname(input);
  if (!hostname) return null;

  // Aceita dominios .myshopify.com OU dominios customizados validos
  if (SHOPIFY_MYSHOPIFY_DOMAIN_REGEX.test(hostname)) return hostname;
  if (GENERAL_DOMAIN_REGEX.test(hostname)) return hostname;

  return null;
}
