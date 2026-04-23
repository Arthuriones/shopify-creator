import { normalizeShopDomain } from "@/lib/shopify/domain";

const SHOPIFY_API_VERSION = "2024-10";

// Cache de tokens por loja (em memória — reseta no restart do server)
const tokenCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();

type ShopifyClientErrorCode =
  | "INVALID_DOMAIN"
  | "INVALID_CREDENTIALS"
  | "REQUEST_FAILED";

export class ShopifyClientError extends Error {
  code: ShopifyClientErrorCode;
  statusCode: number;

  constructor(
    message: string,
    code: ShopifyClientErrorCode,
    statusCode: number
  ) {
    super(message);
    this.name = "ShopifyClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface ShopifyCredentials {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}

function getOperationName(query: string): string {
  const match = query.match(/\b(query|mutation)\s+([A-Za-z0-9_]+)/);
  return match?.[2] || "unknown_operation";
}

function sanitizeErrorText(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function looksLikeMissingPublicationScope(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("read_publications") ||
    (normalized.includes("access denied") && normalized.includes("publications"))
  );
}

async function getInstalledAccessScopes(
  creds: ShopifyCredentials
): Promise<string[]> {
  try {
    const query = `
      query getInstalledScopes {
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `;
    const data = await shopifyGraphQL(creds, query);
    const scopes =
      data?.currentAppInstallation?.accessScopes?.map(
        (scope: { handle?: string }) => scope.handle || ""
      ) || [];
    return scopes.filter(Boolean);
  } catch {
    return [];
  }
}

function looksLikeHtml(contentType: string, body: string): boolean {
  const lowerType = contentType.toLowerCase();
  const lowerBody = body.toLowerCase();

  return (
    lowerType.includes("text/html") ||
    lowerBody.includes("<html") ||
    lowerBody.includes("<script") ||
    lowerBody.includes("<!doctype html")
  );
}

async function getAccessToken(creds: ShopifyCredentials): Promise<string> {
  const normalizedShopDomain = normalizeShopDomain(creds.shopDomain);
  if (!normalizedShopDomain) {
    throw new ShopifyClientError(
      "Use o dominio da loja no formato sualoja.myshopify.com.",
      "INVALID_DOMAIN",
      400
    );
  }

  const cacheKey = `${normalizedShopDomain}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Renova 5 min antes de expirar
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const res = await fetch(
    `https://${normalizedShopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    }
  );

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    const lowerBody = body.toLowerCase();
    const isMyShopifyDomain = /\.myshopify\.com$/i.test(normalizedShopDomain);

    console.log("[shopify/getAccessToken] failed", {
      status: res.status,
      contentType,
      bodySnippet: body.slice(0, 300),
      shopDomain: normalizedShopDomain,
      isMyShopifyDomain,
    });

    if (lowerBody.includes("application_cannot_be_found")) {
      throw new ShopifyClientError(
        "App nao esta instalado nessa loja. Crie o app no dev.shopify.com, gere o link de Custom Distribution para esta loja e instale antes de conectar.",
        "INVALID_CREDENTIALS",
        401
      );
    }

    if (
      res.status === 401 ||
      res.status === 403 ||
      lowerBody.includes("invalid_client") ||
      lowerBody.includes("invalid client")
    ) {
      throw new ShopifyClientError(
        "Client ID ou Client Secret invalidos. Verifique as credenciais do app no Shopify.",
        "INVALID_CREDENTIALS",
        401
      );
    }

    // If the domain is a valid .myshopify.com but we got 404/HTML, the app
    // is almost certainly not installed yet (Shopify returns the storefront
    // HTML page instead of an API response in this scenario).
    if (
      isMyShopifyDomain &&
      (res.status === 404 || looksLikeHtml(contentType, body))
    ) {
      throw new ShopifyClientError(
        "App nao esta instalado nessa loja. Instale o app primeiro: no dev.shopify.com, va em seu App > Distribution > gere o link de Custom Distribution e instale na loja.",
        "INVALID_CREDENTIALS",
        401
      );
    }

    // Non-.myshopify.com domains that return 404/HTML are actually invalid domains
    if (
      res.status === 404 ||
      looksLikeHtml(contentType, body) ||
      lowerBody.includes("cloudflare")
    ) {
      throw new ShopifyClientError(
        `Nao foi possivel acessar o dominio "${creds.shopDomain}". Tente usar o dominio interno ".myshopify.com" da loja.`,
        "INVALID_DOMAIN",
        400
      );
    }

    const details = sanitizeErrorText(body);
    throw new ShopifyClientError(
      details
        ? `Falha ao autenticar na Shopify (${res.status}): ${details}`
        : `Falha ao autenticar na Shopify (status ${res.status}).`,
      "REQUEST_FAILED",
      502
    );
  }

  const data = await res.json();
  const accessToken: string = data.access_token;
  const expiresIn: number = data.expires_in || 86399;

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

async function shopifyGraphQL(
  creds: ShopifyCredentials,
  query: string,
  variables?: Record<string, unknown>
) {
  const accessToken = await getAccessToken(creds);
  const normalizedShopDomain = normalizeShopDomain(creds.shopDomain);
  if (!normalizedShopDomain) {
    throw new ShopifyClientError(
      "Use o dominio da loja no formato sualoja.myshopify.com.",
      "INVALID_DOMAIN",
      400
    );
  }

  const url = `https://${normalizedShopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    console.error("[shopifyGraphQL] GraphQL errors", {
      shopDomain: normalizedShopDomain,
      operation: getOperationName(query),
      errors: json.errors,
    });
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

export async function getShopInfo(creds: ShopifyCredentials) {
  const query = `{
    shop {
      name
      email
      primaryDomain { url host }
      currencyCode
      plan { displayName }
    }
  }`;
  return shopifyGraphQL(creds, query);
}

export async function getThemes(creds: ShopifyCredentials) {
  const query = `{
    themes(first: 10) {
      nodes { id name role }
    }
  }`;
  return shopifyGraphQL(creds, query);
}

async function getOnlineStorePublicationId(
  creds: ShopifyCredentials
): Promise<string | null> {
  const query = `
    query getPublications {
      publications(first: 30) {
        nodes {
          id
          name
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query);
  const nodes = data?.publications?.nodes as { id: string; name: string }[] | undefined;

  if (!nodes || nodes.length === 0) {
    return null;
  }

  const byName = nodes.find((publication) =>
    /online store|loja virtual|tienda online/i.test(publication.name)
  );

  return byName?.id || nodes[0].id || null;
}

async function publishProductToStorefront(
  creds: ShopifyCredentials,
  productId: string
) {
  try {
    const publicationId = await getOnlineStorePublicationId(creds);
    if (!publicationId) {
      return { ok: false, reason: "Nenhuma publication encontrada na loja." };
    }

    const mutation = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(creds, mutation, {
      id: productId,
      input: [{ publicationId }],
    });

    const errors = data?.publishablePublish?.userErrors as
      | { field?: string[]; message: string }[]
      | undefined;

    if (errors && errors.length > 0) {
      console.warn("[shopify.publishProductToStorefront] userErrors", {
        shopDomain: creds.shopDomain,
        productId,
        errors,
      });
      return {
        ok: false,
        reason: errors.map((error) => error.message).join(" | "),
      };
    }

    return { ok: true, publicationId };
  } catch (error) {
    let reason =
      error instanceof Error
        ? error.message
        : "Falha ao publicar no canal da loja.";

    if (looksLikeMissingPublicationScope(reason)) {
      const scopes = await getInstalledAccessScopes(creds);
      const scopesText = scopes.length > 0 ? scopes.join(", ") : "indisponivel";
      reason =
        `Scopes insuficientes para publicar no Online Store. ` +
        `Adicione read_publications e write_publications, reinstale o app e reconecte a loja. ` +
        `Scopes atuais: ${scopesText}`;
    }

    console.error("[shopify.publishProductToStorefront] failed", {
      shopDomain: creds.shopDomain,
      productId,
      reason,
    });
    return { ok: false, reason };
  }
}

export async function createProduct(
  creds: ShopifyCredentials,
  input: {
    title: string;
    descriptionHtml: string;
    tags: string[];
    images: { src: string; altText: string }[];
    variants: { price: string; compareAtPrice?: string; options?: string[] }[];
    options?: string[]; // nomes das opções: ["Cor", "Tamanho"]
    seo?: { title: string; description: string };
    publishToStorefront?: boolean;
  }
) {
  const shouldPublishToStorefront = input.publishToStorefront !== false;
  const hasMultipleVariants = input.variants.length > 1 && input.options?.length;

  // Passo 1: Criar produto com opções se houver variantes
  const createQuery = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          variants(first: 1) { nodes { id } }
          options { id name position values }
        }
        userErrors { field message }
      }
    }
  `;

  const productInput: Record<string, unknown> = {
    title: input.title,
    descriptionHtml: input.descriptionHtml,
    tags: input.tags,
    seo: input.seo,
    status: shouldPublishToStorefront ? "ACTIVE" : "DRAFT",
  };

  const createResult = await shopifyGraphQL(creds, createQuery, {
    input: productInput,
  });

  const product = createResult.productCreate?.product;
  const userErrors = createResult.productCreate?.userErrors;
  if (userErrors?.length > 0) {
    return createResult;
  }
  if (!product?.id) {
    throw new Error("Produto criado mas sem ID retornado");
  }

  // Passo 2: Configurar variantes
  const defaultVariantId = product.variants?.nodes?.[0]?.id;

  if (hasMultipleVariants) {
    // Atualizar a primeira variante default e criar as adicionais
    const variantsToCreate = input.variants.slice(1).map((v) => ({
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      optionValues: (v.options || []).map((val, i) => ({
        optionName: input.options![i],
        name: val,
      })),
    }));

    // Atualizar variante default com opções da primeira variante
    const firstVariant = input.variants[0];
    const bulkInput = [
      {
        id: defaultVariantId,
        price: firstVariant.price,
        ...(firstVariant.compareAtPrice ? { compareAtPrice: firstVariant.compareAtPrice } : {}),
        optionValues: (firstVariant.options || []).map((val, i) => ({
          optionName: input.options![i],
          name: val,
        })),
      },
    ];

    const bulkQuery = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `;
    await shopifyGraphQL(creds, bulkQuery, {
      productId: product.id,
      variants: bulkInput,
    });

    // Criar variantes adicionais
    if (variantsToCreate.length > 0) {
      const createVariantsQuery = `
        mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }
      `;
      await shopifyGraphQL(creds, createVariantsQuery, {
        productId: product.id,
        variants: variantsToCreate,
      });
    }
  } else if (defaultVariantId && input.variants.length > 0) {
    // Produto simples — só atualizar preço da variante default
    const variant = input.variants[0];
    const variantQuery = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `;
    await shopifyGraphQL(creds, variantQuery, {
      productId: product.id,
      variants: [{
        id: defaultVariantId,
        price: variant.price,
        ...(variant.compareAtPrice ? { compareAtPrice: variant.compareAtPrice } : {}),
      }],
    });
  }

  // Passo 3: Adicionar imagens via productCreateMedia
  if (input.images.length > 0) {
    const mediaQuery = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id alt }
          mediaUserErrors { field message }
        }
      }
    `;
    await shopifyGraphQL(creds, mediaQuery, {
      productId: product.id,
      media: input.images.map((img) => ({
        originalSource: img.src,
        alt: img.altText,
        mediaContentType: "IMAGE",
      })),
    });
  }

  let storefrontPublication:
    | { ok: boolean; publicationId?: string; reason?: string }
    | undefined;

  if (shouldPublishToStorefront) {
    storefrontPublication = await publishProductToStorefront(creds, product.id);
  }

  return {
    ...createResult,
    storefrontPublication,
  };
}

const POLICY_TYPE_MAP: Record<string, string> = {
  refund: "REFUND_POLICY",
  privacy: "PRIVACY_POLICY",
  terms: "TERMS_OF_SERVICE",
  shipping: "SHIPPING_POLICY",
};

export async function updateStorePolicies(
  creds: ShopifyCredentials,
  policies: { type: string; body: string }[]
) {
  const results = [];
  for (const policy of policies) {
    const shopifyType = POLICY_TYPE_MAP[policy.type] || policy.type.toUpperCase();
    const query = `
      mutation shopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
        shopPolicyUpdate(shopPolicy: $shopPolicy) {
          shopPolicy { id type body }
          userErrors { field message }
        }
      }
    `;
    const variables = {
      shopPolicy: {
        type: shopifyType,
        body: policy.body,
      },
    };
    const result = await shopifyGraphQL(creds, query, variables);
    results.push(result);
  }
  return results;
}

export async function getProducts(
  creds: ShopifyCredentials,
  optionsOrFirst:
    | number
    | {
        first?: number;
        status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
        query?: string;
      } = 50
) {
  const parsedOptions =
    typeof optionsOrFirst === "number"
      ? { first: optionsOrFirst }
      : optionsOrFirst;

  const safeFirst = Math.min(Math.max(1, Math.floor(parsedOptions.first ?? 50)), 250);
  const filters: string[] = [];

  if (parsedOptions.status) {
    filters.push(`status:${parsedOptions.status}`);
  }
  if (parsedOptions.query?.trim()) {
    filters.push(parsedOptions.query.trim());
  }

  const queryFilter = filters.join(" ");
  const query = `
    query getProducts($first: Int!, $query: String) {
      products(first: $first, query: $query) {
        nodes {
          id
          title
          handle
          status
          descriptionHtml
          tags
          seo { title description }
          images(first: 12) { nodes { url altText } }
          options {
            name
            values
          }
          variants(first: 50) {
            nodes {
              id
              title
              price
              compareAtPrice
              selectedOptions { name value }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(creds, query, {
    first: safeFirst,
    query: queryFilter || null,
  });
}

export async function updateShopifyProduct(
  creds: ShopifyCredentials,
  input: {
    productId: string;
    title: string;
    descriptionHtml: string;
    tags: string[];
    seo?: { title?: string; description?: string };
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
    variants?: {
      id: string;
      price: string;
      compareAtPrice?: string | null;
    }[];
    images?: { src: string; altText: string }[];
    publishToStorefront?: boolean;
  }
) {
  const nextStatus =
    input.status ?? (input.publishToStorefront === false ? "DRAFT" : "ACTIVE");

  const mutation = `
    mutation productUpdate($input: ProductUpdateInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(creds, mutation, {
    input: {
      id: input.productId,
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      tags: input.tags,
      seo: input.seo,
      status: nextStatus,
    },
  });

  const userErrors = result?.productUpdate?.userErrors as
    | { field?: string[]; message: string }[]
    | undefined;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map((err) => err.message).join(" | "));
  }

  let variantsUpdate:
    | {
        productVariants?: { id: string }[];
        userErrors?: { field?: string[]; message: string }[];
      }
    | undefined;
  if (input.variants && input.variants.length > 0) {
    const variantsMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `;

    const variantsPayload = input.variants.map((variant) => {
      const payload: {
        id: string;
        price: string;
        compareAtPrice?: string | null;
      } = {
        id: variant.id,
        price: variant.price,
      };

      if (variant.compareAtPrice !== undefined) {
        payload.compareAtPrice = variant.compareAtPrice;
      }

      return payload;
    });

    const variantsResult = await shopifyGraphQL(creds, variantsMutation, {
      productId: input.productId,
      variants: variantsPayload,
    });

    variantsUpdate = variantsResult?.productVariantsBulkUpdate as
      | {
          productVariants?: { id: string }[];
          userErrors?: { field?: string[]; message: string }[];
        }
      | undefined;

    if (variantsUpdate?.userErrors && variantsUpdate.userErrors.length > 0) {
      throw new Error(variantsUpdate.userErrors.map((err) => err.message).join(" | "));
    }
  }

  let storefrontPublication:
    | { ok: boolean; publicationId?: string; reason?: string }
    | undefined;
  if (nextStatus === "ACTIVE" && input.publishToStorefront !== false) {
    storefrontPublication = await publishProductToStorefront(creds, input.productId);
  }

  if (input.images && input.images.length > 0) {
    try {
      const mediaQuery = `query { product(id: "${input.productId}") { media(first: 50) { nodes { id } } } }`;
      const mediaRes = await shopifyGraphQL(creds, mediaQuery);
      const mediaIds = mediaRes?.product?.media?.nodes?.map((n: { id: string }) => n.id) || [];
      
      if (mediaIds.length > 0) {
        const deleteMutation = `mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) { productDeleteMedia(productId: $productId, mediaIds: $mediaIds) { deletedMediaIds } }`;
        await shopifyGraphQL(creds, deleteMutation, { productId: input.productId, mediaIds });
      }
      
      const createMutation = `mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { media { id } } }`;
      await shopifyGraphQL(creds, createMutation, {
        productId: input.productId,
        media: input.images.map((img) => ({ originalSource: img.src, alt: img.altText, mediaContentType: "IMAGE" }))
      });
    } catch (err) {
      console.warn("[shopify.updateShopifyProduct] Failed to sync media:", err);
    }
  }

  return {
    ...result,
    variantsUpdate,
    storefrontPublication,
  };
}

export async function getMenus(creds: ShopifyCredentials) {
  const query = `
    query {
      menus(first: 10) {
        nodes {
          id
          title
          handle
          itemsCount
          items(first: 20) {
            id
            title
            url
            type
            items(first: 10) {
              id
              title
              url
              type
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(creds, query);
}

function resolveMenuItemType(url: string): string {
  if (url === "/") return "FRONTPAGE";
  if (url.startsWith("/collections")) return "CATALOG";
  if (url.startsWith("/policies")) return "SHOP_POLICY";
  if (url.startsWith("/pages")) return "PAGE";
  return "HTTP";
}

function mapMenuItems(
  items: { title: string; url: string; type?: string; items?: { title: string; url: string; type?: string }[] }[]
) {
  return items.map((item) => ({
    title: item.title,
    url: item.url,
    type: item.type || resolveMenuItemType(item.url),
    ...(item.items?.length
      ? { items: item.items.map((sub) => ({
          title: sub.title,
          url: sub.url,
          type: sub.type || resolveMenuItemType(sub.url),
        })) }
      : {}),
  }));
}

export async function createMenu(
  creds: ShopifyCredentials,
  input: {
    title: string;
    handle: string;
    items: {
      title: string;
      url: string;
      type?: string;
      items?: { title: string; url: string; type?: string }[];
    }[];
  }
) {
  const query = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return shopifyGraphQL(creds, query, {
    title: input.title,
    handle: input.handle,
    items: mapMenuItems(input.items),
  });
}

export async function createPages(
  creds: ShopifyCredentials,
  pages: { title: string; body: string; handle?: string }[]
): Promise<{ id: string; title: string; handle: string }[]> {
  const query = `
    mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const createdPages: { id: string; title: string; handle: string }[] = [];

  for (const page of pages) {
    const variables: Record<string, unknown> = {
      page: {
        title: page.title,
        body: page.body,
        ...(page.handle ? { handle: page.handle } : {}),
      },
    };

    const result = await shopifyGraphQL(creds, query, variables);
    const userErrors = result.pageCreate?.userErrors;
    if (userErrors?.length > 0) {
      const isHandleTaken = userErrors.some(
        (e: { message: string }) => e.message.includes("already been taken")
      );
      if (isHandleTaken) {
        // Page already exists — skip silently
        createdPages.push({ id: "", title: page.title, handle: page.handle || "" });
        continue;
      }
      throw new Error(
        `Erro ao criar página "${page.title}": ${JSON.stringify(userErrors)}`
      );
    }

    const created = result.pageCreate?.page;
    if (created) {
      createdPages.push(created);
    }
  }

  return createdPages;
}
