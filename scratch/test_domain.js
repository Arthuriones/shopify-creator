const SHOPIFY_MYSHOPIFY_DOMAIN_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.myshopify\.com$/i;

const GENERAL_DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function extractHostname(input) {
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

function normalizeShopDomain(input) {
  const hostname = extractHostname(input);
  if (!hostname) return null;

  // Aceita dominios .myshopify.com OU dominios customizados validos
  if (SHOPIFY_MYSHOPIFY_DOMAIN_REGEX.test(hostname)) return hostname;
  if (GENERAL_DOMAIN_REGEX.test(hostname)) return hostname;

  return null;
}

const tests = [
  "loja.myshopify.com",
  "LOJA.myshopify.com",
  "https://loja.myshopify.com",
  "loja.myshopify.com/",
  "loja.myshopify.com/admin",
  "loja.com",
  "minhaloja.com.br",
  "invalid",
  "loja.myshopify.com.br"
];

tests.forEach(t => {
  console.log(`${t} -> ${normalizeShopDomain(t)}`);
});
