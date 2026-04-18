const SHOPIFY_API_VERSION = "2024-10";

// Cache de tokens por loja (em memória — reseta no restart do server)
const tokenCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();

interface ShopifyCredentials {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}

async function getAccessToken(creds: ShopifyCredentials): Promise<string> {
  const cacheKey = `${creds.shopDomain}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Renova 5 min antes de expirar
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const res = await fetch(
    `https://${creds.shopDomain}/admin/oauth/access_token`,
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
    const text = await res.text();
    throw new Error(
      `Shopify token error: ${res.status} ${res.statusText} - ${text}`
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
  const url = `https://${creds.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

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
  }
) {
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

  return createResult;
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
  first: number = 50
) {
  const safeFirst = Math.min(Math.max(1, Math.floor(first)), 250);
  const query = `
    query getProducts($first: Int!) {
      products(first: $first) {
        nodes {
          id title handle status
          images(first: 1) { nodes { url altText } }
          variants(first: 1) { nodes { price compareAtPrice } }
        }
      }
    }
  `;
  return shopifyGraphQL(creds, query, { first: safeFirst });
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
