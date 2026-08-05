// Fonte unica dos escopos do app na Shopify.
//
// Antes esta lista existia duplicada: uma no fluxo de OAuth
// (src/app/api/shopify/auth/route.ts) e outra, escrita a mao, no tutorial de
// conexao (stores/page.tsx). As duas ja tinham divergido — o tutorial mandava o
// usuario configurar `write_themes`, que o OAuth nunca pedia. O resultado era o
// app pedir um conjunto de permissoes diferente do que a loja tinha
// configurado, gerando prompt de reinstalacao ou "access denied" depois.
//
// `write_themes` fica na lista porque o app escreve assets de tema em
// src/app/api/checkout-routes/[id]/update-theme/route.ts.
export const SHOPIFY_SCOPES = [
  "write_legal_policies",
  "write_online_store_navigation",
  "read_products",
  "write_products",
  "read_publications",
  "write_publications",
  "read_content",
  "write_content",
  "read_themes",
  "write_themes",
  "read_metaobjects",
  "write_metaobjects",
  "read_metaobject_definitions",
  "write_metaobject_definitions",
] as const;

// String pronta para colar no painel da Shopify e para a URL de authorize.
export const SHOPIFY_SCOPES_STRING = SHOPIFY_SCOPES.join(",");
