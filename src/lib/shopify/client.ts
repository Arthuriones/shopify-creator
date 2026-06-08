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

export interface ShopifyCredentials {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string | null;
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
  if (creds.accessToken) {
    tokenCache.set(cacheKey, {
      accessToken: creds.accessToken,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    return creds.accessToken;
  }

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
    if (res.status === 402) {
      throw new ShopifyClientError(
        "A Shopify recusou a chamada API com 402 Payment Required. Normalmente isso acontece quando a loja esta pausada, congelada, sem plano ativo ou com restricao de billing. Ative um plano/trial valido nessa loja e tente novamente.",
        "REQUEST_FAILED",
        402
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text().catch(() => "");
    const details = sanitizeErrorText(body);
    throw new ShopifyClientError(
      details
        ? `Shopify API error: ${res.status} ${res.statusText} - ${details}`
        : `Shopify API error: ${res.status} ${res.statusText}`,
      "REQUEST_FAILED",
      res.status
    );
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

async function getPrimaryInventoryLocationId(creds: ShopifyCredentials) {
  const query = `
    query getInventoryLocation {
      locations(first: 1, query: "active:true") {
        nodes {
          id
          name
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query);
  return data?.locations?.nodes?.[0]?.id as string | undefined;
}

async function getProductInventoryItems(
  creds: ShopifyCredentials,
  productId: string
) {
  const query = `
    query getProductInventoryItems($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          nodes {
            id
            inventoryItem {
              id
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query, { id: productId });
  return (
    data?.product?.variants?.nodes as
      | { id?: string; inventoryItem?: { id?: string } | null }[]
      | undefined
  ) || [];
}

async function applyInitialInventoryQuantities(
  creds: ShopifyCredentials,
  productId: string,
  quantitiesByVariantIndex: (number | undefined)[]
) {
  const hasQuantity = quantitiesByVariantIndex.some(
    (quantity) => typeof quantity === "number"
  );
  if (!hasQuantity) return [] as string[];

  const warnings: string[] = [];

  try {
    const locationId = await getPrimaryInventoryLocationId(creds);
    if (!locationId) {
      return ["Estoque inicial nao aplicado: nenhuma location ativa encontrada na Shopify."];
    }

    const variants = await getProductInventoryItems(creds, productId);
    const quantities = quantitiesByVariantIndex
      .map((quantity, index) => {
        const inventoryItemId = variants[index]?.inventoryItem?.id;
        if (typeof quantity !== "number" || !inventoryItemId) return null;
        return {
          inventoryItemId,
          locationId,
          quantity,
          compareQuantity: null,
        };
      })
      .filter(
        (
          item
        ): item is {
          inventoryItemId: string;
          locationId: string;
          quantity: number;
          compareQuantity: null;
        } => Boolean(item)
      );

    if (quantities.length === 0) {
      return ["Estoque inicial nao aplicado: variantes sem inventory item retornado pela Shopify."];
    }

    const mutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await shopifyGraphQL(creds, mutation, {
      input: {
        ignoreCompareQuantity: true,
        name: "available",
        reason: "correction",
        referenceDocumentUri: `gid://shopify-creator/ProductClone/${productId.split("/").pop() || Date.now()}`,
        quantities,
      },
    });

    const errors = result?.inventorySetQuantities?.userErrors as
      | { field?: string[]; message: string }[]
      | undefined;
    if (errors?.length) {
      warnings.push(
        `Estoque inicial nao aplicado: ${errors
          .map((error) =>
            error.field?.length
              ? `${error.field.join(".")}: ${error.message}`
              : error.message
          )
          .join(" | ")}`
      );
    }
  } catch (error) {
    warnings.push(
      `Estoque inicial nao aplicado: ${
        error instanceof Error ? error.message : "erro desconhecido"
      }`
    );
  }

  return warnings;
}

export async function syncProductCollections(
  creds: ShopifyCredentials,
  input: {
    collections: { handle: string; title: string }[];
    assignments: { collectionHandle: string; productIds: string[] }[];
  }
) {
  type ShopifyUserError = { field?: string[]; message: string };

  function formatErrors(errors: ShopifyUserError[] | undefined) {
    return (errors || [])
      .map((error) =>
        error.field?.length
          ? `${error.field.join(".")}: ${error.message}`
          : error.message
      )
      .join(" | ");
  }

  async function findCollectionByHandle(handle: string) {
    const query = `
      query findCollection($query: String!) {
        collections(first: 1, query: $query) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `;
    const data = await shopifyGraphQL(creds, query, {
      query: `handle:${handle}`,
    });
    return data?.collections?.nodes?.[0] as
      | { id: string; title: string; handle: string }
      | undefined;
  }

  async function createCollection(collection: { handle: string; title: string }) {
    const mutation = `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
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
    const result = await shopifyGraphQL(creds, mutation, {
      input: {
        title: collection.title,
        handle: collection.handle,
      },
    });
    const errors = result?.collectionCreate?.userErrors as
      | ShopifyUserError[]
      | undefined;
    if (errors?.length) {
      throw new Error(formatErrors(errors) || "Falha ao criar colecao.");
    }
    return result?.collectionCreate?.collection as
      | { id: string; title: string; handle: string }
      | undefined;
  }

  async function ensureCollection(collection: { handle: string; title: string }) {
    const existing = await findCollectionByHandle(collection.handle);
    if (existing?.id) return existing;
    return createCollection(collection);
  }

  function isAlreadyInCollectionError(message: string) {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("already") ||
      normalized.includes("ja esta") ||
      normalized.includes("já está")
    );
  }

  async function runAddProducts(collectionId: string, productIds: string[]) {
    const mutation = `
      mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          collection {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const result = await shopifyGraphQL(creds, mutation, {
      id: collectionId,
      productIds: [...new Set(productIds)].filter(Boolean),
    });
    const errors = result?.collectionAddProducts?.userErrors as
      | ShopifyUserError[]
      | undefined;
    return errors || [];
  }

  async function addProducts(collectionId: string, productIds: string[]) {
    const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
    const errors = await runAddProducts(collectionId, uniqueProductIds);
    if (!errors.length) return "";

    if (uniqueProductIds.length === 1) {
      const blockingErrors = errors.filter(
        (error) => !isAlreadyInCollectionError(error.message)
      );
      return formatErrors(blockingErrors);
    }

    const warnings: string[] = [];
    for (const productId of uniqueProductIds) {
      const singleErrors = await runAddProducts(collectionId, [productId]);
      const blockingErrors = singleErrors.filter(
        (error) => !isAlreadyInCollectionError(error.message)
      );
      const warning = formatErrors(blockingErrors);
      if (warning) warnings.push(warning);
    }
    return warnings.join(" | ");
  }

  const collectionByHandle = new Map(
    input.collections
      .filter((collection) => collection.handle && collection.title)
      .map((collection) => [collection.handle, collection])
  );
  const warnings: string[] = [];
  const synced: { handle: string; productCount: number }[] = [];

  for (const assignment of input.assignments) {
    const productIds = [...new Set(assignment.productIds)].filter(Boolean);
    if (productIds.length === 0) continue;

    const sourceCollection =
      collectionByHandle.get(assignment.collectionHandle) || {
        handle: assignment.collectionHandle,
        title: assignment.collectionHandle.replace(/[-_]+/g, " "),
      };

    try {
      const collection = await ensureCollection(sourceCollection);
      if (!collection?.id) {
        warnings.push(`Colecao ${sourceCollection.title} nao retornou ID.`);
        continue;
      }
      const publication = await publishProductToStorefront(creds, collection.id);
      if (!publication.ok && publication.reason) {
        warnings.push(
          `${sourceCollection.title}: colecao criada, mas nao publicada no Online Store (${publication.reason})`
        );
      }
      const addWarning = await addProducts(collection.id, productIds);
      if (addWarning) {
        warnings.push(`${sourceCollection.title}: ${addWarning}`);
      } else {
        synced.push({
          handle: sourceCollection.handle,
          productCount: productIds.length,
        });
      }
    } catch (error) {
      warnings.push(
        `${sourceCollection.title}: ${
          error instanceof Error ? error.message : "falha ao sincronizar"
        }`
      );
    }
  }

  return { synced, warnings };
}

export async function createProduct(
  creds: ShopifyCredentials,
  input: {
    title: string;
    descriptionHtml: string;
    tags: string[];
    categoryId?: string | null;
    productType?: string | null;
    metafields?: {
      namespace: string;
      key: string;
      type: string;
      value: string;
    }[];
    images: { src: string; altText: string }[];
    variants: {
      price: string;
      compareAtPrice?: string;
      options?: string[];
      inventoryQuantity?: number;
      inventoryTracked?: boolean;
    }[];
    options?: string[]; // nomes das opções: ["Cor", "Tamanho"]
    seo?: { title: string; description: string };
    publishToStorefront?: boolean;
  }
) {
  type ShopifyUserError = { field?: string[]; message: string };
  type CreateProductVariantInput = {
    price: string | number;
    compareAtPrice?: string | number;
    options?: string[];
    inventoryQuantity?: number;
    inventoryTracked?: boolean;
  };

  function assertNoUserErrors(
    errors: ShopifyUserError[] | undefined,
    context: string
  ) {
    if (!errors || errors.length === 0) return;
    throw new Error(
      `${context}: ${errors
        .map((error) =>
          error.field?.length
            ? `${error.field.join(".")}: ${error.message}`
            : error.message
        )
        .join(" | ")}`
    );
  }

  function normalizePrice(value: string | number | null | undefined) {
    if (typeof value === "number") {
      const numeric = value > 999 && Number.isInteger(value) ? value / 100 : value;
      return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
    }

    const raw = String(value ?? "")
      .trim()
      .replace(/[^\d,.-]/g, "");
    const normalized =
      raw.includes(",") && !raw.includes(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
    const numeric = Number(normalized || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
  }

  function normalizeInventoryQuantity(value: unknown) {
    if (value === null || value === undefined || value === "") return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.max(0, Math.floor(numeric));
  }

  function buildProductOptions() {
    if (!hasMultipleVariants || !input.options?.length) return undefined;
    return input.options.map((optionName, optionIndex) => {
      const values = [
        ...new Set(
          normalizedVariants
            .map((variant) => variant.options?.[optionIndex])
            .filter((value): value is string => Boolean(value?.trim()))
        ),
      ];
      return {
        name: optionName,
        values: (values.length ? values : ["Default"]).map((name) => ({ name })),
      };
    });
  }

  const shouldPublishToStorefront = input.publishToStorefront !== false;
  const sourceVariants: CreateProductVariantInput[] =
    input.variants.length > 0 ? input.variants : [{ price: "0.00" }];
  const normalizedVariants = sourceVariants.map((variant) => ({
    ...variant,
    price: normalizePrice(variant.price),
    compareAtPrice: variant.compareAtPrice
      ? normalizePrice(variant.compareAtPrice)
      : undefined,
    inventoryQuantity: normalizeInventoryQuantity(variant.inventoryQuantity),
    inventoryTracked:
      typeof variant.inventoryTracked === "boolean"
        ? variant.inventoryTracked
        : false,
  }));
  const hasMultipleVariants =
    normalizedVariants.length > 1 && Boolean(input.options?.length);

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
  if (input.categoryId) {
    productInput.category = input.categoryId;
  }
  if (input.productType) {
    productInput.productType = input.productType;
  }
  if (input.metafields?.length) {
    productInput.metafields = input.metafields;
  }
  const productOptions = buildProductOptions();
  if (productOptions) {
    productInput.productOptions = productOptions;
  }

  const createResult = await shopifyGraphQL(creds, createQuery, {
    input: productInput,
  });

  const product = createResult.productCreate?.product;
  const userErrors = createResult.productCreate?.userErrors;
  assertNoUserErrors(userErrors, "Falha ao criar produto na Shopify");
  if (!product?.id) {
    throw new Error("Produto criado mas sem ID retornado");
  }

  // Passo 2: Configurar variantes
  let defaultVariantId = product.variants?.nodes?.[0]?.id;
  if (!defaultVariantId) {
    const refreshedProduct = await getProductById(creds, product.id).catch(() => null);
    defaultVariantId = refreshedProduct?.variants?.nodes?.[0]?.id;
  }

  if (hasMultipleVariants) {
    // Atualizar a primeira variante default e criar as adicionais
    if (!defaultVariantId) {
      throw new Error("Produto criado, mas a Shopify nao retornou a variante para aplicar o preco.");
    }

    const variantsToCreate = normalizedVariants.slice(1).map((v) => ({
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      ...(typeof v.inventoryTracked === "boolean"
        ? { inventoryItem: { tracked: v.inventoryTracked } }
        : {}),
      optionValues: (v.options || []).map((val, i) => ({
        optionName: input.options![i],
        name: val,
      })),
    }));

    // Atualizar variante default com opções da primeira variante
    const firstVariant = normalizedVariants[0];
    const bulkInput = [
      {
        id: defaultVariantId,
        price: firstVariant.price,
        ...(firstVariant.compareAtPrice ? { compareAtPrice: firstVariant.compareAtPrice } : {}),
        ...(typeof firstVariant.inventoryTracked === "boolean"
          ? { inventoryItem: { tracked: firstVariant.inventoryTracked } }
          : {}),
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
    const updateResult = await shopifyGraphQL(creds, bulkQuery, {
      productId: product.id,
      variants: bulkInput,
    });
    assertNoUserErrors(
      updateResult?.productVariantsBulkUpdate?.userErrors,
      "Falha ao aplicar preco da primeira variante"
    );

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
      const createVariantsResult = await shopifyGraphQL(creds, createVariantsQuery, {
        productId: product.id,
        variants: variantsToCreate,
      });
      assertNoUserErrors(
        createVariantsResult?.productVariantsBulkCreate?.userErrors,
        "Falha ao criar variantes com preco"
      );
    }
  } else if (normalizedVariants.length > 0) {
    if (!defaultVariantId) {
      throw new Error("Produto criado, mas a Shopify nao retornou a variante para aplicar o preco.");
    }

    // Produto simples — só atualizar preço da variante default
    const variant = normalizedVariants[0];
    const variantQuery = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `;
    const variantResult = await shopifyGraphQL(creds, variantQuery, {
      productId: product.id,
      variants: [{
        id: defaultVariantId,
        price: variant.price,
        ...(variant.compareAtPrice ? { compareAtPrice: variant.compareAtPrice } : {}),
        ...(typeof variant.inventoryTracked === "boolean"
          ? { inventoryItem: { tracked: variant.inventoryTracked } }
          : {}),
      }],
    });
    assertNoUserErrors(
      variantResult?.productVariantsBulkUpdate?.userErrors,
      "Falha ao aplicar preco do produto"
    );
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

  const inventoryWarnings = await applyInitialInventoryQuantities(
    creds,
    product.id,
    normalizedVariants.map((variant) => variant.inventoryQuantity)
  );

  let storefrontPublication:
    | { ok: boolean; publicationId?: string; reason?: string }
    | undefined;

  if (shouldPublishToStorefront) {
    storefrontPublication = await publishProductToStorefront(creds, product.id);
  }

  const syncedProduct = await getProductById(creds, product.id).catch(() => null);

  return {
    ...createResult,
    syncedProduct,
    storefrontPublication,
    inventoryWarnings,
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
          productType
          category { id name fullName }
          metafields(first: 20, namespace: "custom") {
            nodes {
              namespace
              key
              type
              value
            }
          }
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
              sku
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

export async function getProductById(creds: ShopifyCredentials, productId: string) {
  const query = `
    query getProductById($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        status
        descriptionHtml
        tags
        productType
        category { id name fullName }
        metafields(first: 20, namespace: "custom") {
          nodes {
            namespace
            key
            type
            value
          }
        }
        seo { title description }
        images(first: 20) { nodes { url altText } }
        options {
          name
          values
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            selectedOptions { name value }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query, { id: productId });
  return data?.product || null;
}

export async function getProductsByIds(
  creds: ShopifyCredentials,
  productIds: string[]
) {
  const ids = [...new Set(productIds)].filter(Boolean).slice(0, 50);
  if (ids.length === 0) return [];

  const query = `
    query getProductsByIds($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          status
          descriptionHtml
          tags
          productType
          category { id name fullName }
          metafields(first: 20, namespace: "custom") {
            nodes {
              namespace
              key
              type
              value
            }
          }
          seo { title description }
          images(first: 20) { nodes { url altText } }
          options {
            name
            values
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              price
              compareAtPrice
              selectedOptions { name value }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query, { ids });
  return (data?.nodes || []).filter(Boolean);
}

export interface ShopifyTaxonomyCategoryMatch {
  id: string;
  name: string;
  fullName: string;
  isLeaf?: boolean;
  isArchived?: boolean;
}

export interface ShopifyTaxonomyAttributeValue {
  id: string;
  name: string;
}

export interface ShopifyTaxonomyAttributeMatch {
  id: string;
  name: string;
  type: string;
  values: ShopifyTaxonomyAttributeValue[];
}

export interface ShopifyStandardMetafieldTemplate {
  id: string;
  name: string;
  namespace: string;
  key: string;
  ownerTypes: string[];
  type: string;
}

export interface ShopifyProductMetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
  label?: string;
  displayValue?: string;
  definitionTemplateId?: string;
}

const SHOPIFY_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const metafieldDefinitionCache = new Map<string, number>();
const taxonomyCategoryCache = new Map<
  string,
  { expiresAt: number; value: ShopifyTaxonomyCategoryMatch[] }
>();
const categoryMetafieldDataCache = new Map<
  string,
  {
    expiresAt: number;
    value: {
      attributes: ShopifyTaxonomyAttributeMatch[];
      templates: ShopifyStandardMetafieldTemplate[];
    };
  }
>();

type ShopifyMetafieldDefinitionOwnerType = "PRODUCT" | "PRODUCTVARIANT";

function cachedShopKey(creds: ShopifyCredentials) {
  return normalizeShopDomain(creds.shopDomain) || creds.shopDomain;
}

function isCacheFresh(expiresAt?: number) {
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

function metafieldDefinitionName(field: ShopifyProductMetafieldInput) {
  return field.key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 80);
}

async function ensureStandardProductMetafieldDefinition(
  creds: ShopifyCredentials,
  field: ShopifyProductMetafieldInput
) {
  const cacheKey = `${cachedShopKey(creds)}:standard-product:${field.definitionTemplateId || `${field.namespace}.${field.key}`}`;
  if (isCacheFresh(metafieldDefinitionCache.get(cacheKey))) return null;

  const mutation = field.definitionTemplateId
    ? `
      mutation enableStandardMetafieldDefinition($id: ID!, $ownerType: MetafieldOwnerType!, $pin: Boolean!) {
        standardMetafieldDefinitionEnable(id: $id, ownerType: $ownerType, pin: $pin) {
          createdDefinition { id namespace key }
          userErrors { field message }
        }
      }
    `
    : `
      mutation enableStandardMetafieldDefinition($namespace: String!, $key: String!, $ownerType: MetafieldOwnerType!, $pin: Boolean!) {
        standardMetafieldDefinitionEnable(namespace: $namespace, key: $key, ownerType: $ownerType, pin: $pin) {
          createdDefinition { id namespace key }
          userErrors { field message }
        }
      }
    `;

  const variables = field.definitionTemplateId
    ? {
        id: field.definitionTemplateId,
        ownerType: "PRODUCT",
        pin: true,
      }
    : {
        namespace: field.namespace,
        key: field.key,
        ownerType: "PRODUCT",
        pin: true,
      };

  const enabled = await shopifyGraphQL(creds, mutation, variables);
  const userErrors = enabled?.standardMetafieldDefinitionEnable?.userErrors as
    | { field?: string[]; message: string }[]
    | undefined;

  if (userErrors?.length) {
    const alreadyExists = userErrors.some((error) =>
      /already exists|taken|ja existe|jÃ¡ existe|enabled|active/i.test(error.message)
    );
    if (!alreadyExists) {
      return `${field.namespace}.${field.key}: ${userErrors
        .map((error) => error.message)
        .join(" | ")}`;
    }
  }

  metafieldDefinitionCache.set(cacheKey, Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS);
  return null;
}

async function ensureMetafieldDefinitions(
  creds: ShopifyCredentials,
  fields: ShopifyProductMetafieldInput[],
  ownerType: ShopifyMetafieldDefinitionOwnerType
) {
  const uniqueFields = Array.from(
    new Map(fields.map((field) => [`${field.namespace}.${field.key}`, field])).values()
  );
  const warnings: string[] = [];

  for (const field of uniqueFields) {
    if (ownerType === "PRODUCT" && field.namespace === "shopify") {
      try {
        const warning = await ensureStandardProductMetafieldDefinition(creds, field);
        if (warning) warnings.push(warning);
      } catch (error) {
        warnings.push(
          `${field.namespace}.${field.key}: ${
            error instanceof Error ? error.message : "falha ao ativar definicao padrao"
          }`
        );
      }
      continue;
    }

    const cacheKey = `${cachedShopKey(creds)}:${ownerType.toLowerCase()}:${field.namespace}.${field.key}:${field.type}`;
    if (isCacheFresh(metafieldDefinitionCache.get(cacheKey))) continue;

    const existingQuery = `
      query getMetafieldDefinition($ownerType: MetafieldOwnerType!, $namespace: String, $key: String) {
        metafieldDefinitions(ownerType: $ownerType, namespace: $namespace, key: $key, first: 1) {
          nodes { id namespace key type { name } }
        }
      }
    `;

    try {
      const existing = await shopifyGraphQL(creds, existingQuery, {
        ownerType,
        namespace: field.namespace,
        key: field.key,
      });
      if (existing?.metafieldDefinitions?.nodes?.[0]?.id) {
        metafieldDefinitionCache.set(
          cacheKey,
          Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS
        );
        continue;
      }

      const createMutation = `
        mutation createProductMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id namespace key }
            userErrors { field message }
          }
        }
      `;
      const created = await shopifyGraphQL(creds, createMutation, {
        definition: {
          ownerType,
          namespace: field.namespace,
          key: field.key,
          name: metafieldDefinitionName(field),
          type: field.type,
          pin: true,
        },
      });
      const userErrors = created?.metafieldDefinitionCreate?.userErrors as
        | { field?: string[]; message: string }[]
        | undefined;
      if (userErrors?.length) {
        const alreadyExists = userErrors.some((error) =>
          /already exists|taken|ja existe|já existe/i.test(error.message)
        );
        if (alreadyExists) {
          metafieldDefinitionCache.set(
            cacheKey,
            Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS
          );
        } else {
          warnings.push(
            `${field.namespace}.${field.key}: ${userErrors
              .map((error) => error.message)
              .join(" | ")}`
          );
        }
      } else {
        metafieldDefinitionCache.set(
          cacheKey,
          Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS
        );
      }
    } catch (error) {
      warnings.push(
        `${field.namespace}.${field.key}: ${
          error instanceof Error ? error.message : "falha ao criar definicao"
        }`
      );
    }
  }

  return warnings;
}

export async function ensureProductMetafieldDefinitions(
  creds: ShopifyCredentials,
  fields: ShopifyProductMetafieldInput[]
) {
  return ensureMetafieldDefinitions(creds, fields, "PRODUCT");
}

export async function ensureProductVariantMetafieldDefinitions(
  creds: ShopifyCredentials,
  fields: ShopifyProductMetafieldInput[]
) {
  return ensureMetafieldDefinitions(creds, fields, "PRODUCTVARIANT");
}

export async function setProductMetafields(
  creds: ShopifyCredentials,
  productId: string,
  fields: ShopifyProductMetafieldInput[]
) {
  if (fields.length === 0) return { metafields: [], userErrors: [] };

  const definitionWarnings = await ensureProductMetafieldDefinitions(creds, fields);
  const mutation = `
    mutation setProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key type value }
        userErrors { field message code }
      }
    }
  `;
  const result = await shopifyGraphQL(creds, mutation, {
    metafields: fields.map((field) => ({
      ownerId: productId,
      namespace: field.namespace,
      key: field.key,
      type: field.type,
      value: field.value,
    })),
  });
  const userErrors = result?.metafieldsSet?.userErrors as
    | { field?: string[]; message: string; code?: string }[]
    | undefined;

  if (userErrors?.length) {
    throw new Error(
      [
        ...definitionWarnings,
        ...userErrors.map((err) =>
          err.field?.length ? `${err.field.join(".")}: ${err.message}` : err.message
        ),
      ].join(" | ")
    );
  }

  return {
    ...result?.metafieldsSet,
    definitionWarnings,
  };
}

export async function setProductVariantMetafields(
  creds: ShopifyCredentials,
  variantIds: string[],
  fields: ShopifyProductMetafieldInput[]
) {
  const uniqueVariantIds = [...new Set(variantIds)].filter(Boolean);
  if (uniqueVariantIds.length === 0 || fields.length === 0) {
    return { metafields: [], userErrors: [] };
  }

  const definitionWarnings = await ensureProductVariantMetafieldDefinitions(
    creds,
    fields
  );
  const mutation = `
    mutation setProductVariantMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key type value ownerType }
        userErrors { field message code }
      }
    }
  `;
  const result = await shopifyGraphQL(creds, mutation, {
    metafields: uniqueVariantIds.flatMap((variantId) =>
      fields.map((field) => ({
        ownerId: variantId,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: field.value,
      }))
    ),
  });
  const userErrors = result?.metafieldsSet?.userErrors as
    | { field?: string[]; message: string; code?: string }[]
    | undefined;

  if (userErrors?.length) {
    throw new Error(
      [
        ...definitionWarnings,
        ...userErrors.map((err) =>
          err.field?.length ? `${err.field.join(".")}: ${err.message}` : err.message
        ),
      ].join(" | ")
    );
  }

  return {
    ...result?.metafieldsSet,
    definitionWarnings,
  };
}

export async function searchShopifyTaxonomyCategories(
  creds: ShopifyCredentials,
  search: string,
  first = 5
): Promise<ShopifyTaxonomyCategoryMatch[]> {
  const queryText = search.trim();
  if (!queryText) return [];
  const cacheKey = `${cachedShopKey(creds)}:${first}:${queryText.toLowerCase()}`;
  const cached = taxonomyCategoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = `
    query searchTaxonomyCategories($search: String!, $first: Int!) {
      taxonomy {
        categories(search: $search, first: $first) {
          nodes {
            id
            name
            fullName
            isLeaf
            isArchived
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query, {
    search: queryText,
    first: Math.min(Math.max(Math.floor(first), 1), 20),
  });

  const nodes = data?.taxonomy?.categories?.nodes || [];
  const matches = nodes
    .map((node: Partial<ShopifyTaxonomyCategoryMatch>) => ({
      id: String(node.id || ""),
      name: String(node.name || ""),
      fullName: String(node.fullName || node.name || ""),
      isLeaf: node.isLeaf,
      isArchived: node.isArchived,
    }))
    .filter(
      (node: ShopifyTaxonomyCategoryMatch) =>
        node.id && node.name && node.isArchived !== true
    );

  taxonomyCategoryCache.set(cacheKey, {
    expiresAt: Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS,
    value: matches,
  });

  return matches;
}

export async function getShopifyCategoryMetafieldData(
  creds: ShopifyCredentials,
  categoryId: string
): Promise<{
  attributes: ShopifyTaxonomyAttributeMatch[];
  templates: ShopifyStandardMetafieldTemplate[];
}> {
  if (!categoryId) return { attributes: [], templates: [] };

  const cacheKey = `${cachedShopKey(creds)}:${categoryId}:category-metafields`;
  const cached = categoryMetafieldDataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = `
    query getCategoryMetafieldData($categoryId: ID!, $categoryConstraintValue: String!) {
      node(id: $categoryId) {
        ... on TaxonomyCategory {
          attributes(first: 50) {
            nodes {
              __typename
              ... on TaxonomyChoiceListAttribute {
                id
                name
                values(first: 250) {
                  nodes { id name }
                }
              }
              ... on TaxonomyMeasurementAttribute {
                id
                name
                options { key value }
              }
              ... on TaxonomyAttribute {
                id
              }
            }
          }
        }
      }
      standardMetafieldDefinitionTemplates(
        first: 100
        constraintStatus: CONSTRAINED_ONLY
        constraintSubtype: { key: "category", value: $categoryConstraintValue }
      ) {
        nodes {
          id
          name
          namespace
          key
          ownerTypes
          type { name }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(creds, query, {
    categoryId,
    categoryConstraintValue: categoryId,
  });
  const attributes =
    data?.node?.attributes?.nodes?.map(
      (node: {
        id?: string;
        name?: string;
        __typename?: string;
        values?: { nodes?: { id?: string; name?: string }[] };
        options?: { key?: string; value?: string }[];
      }) => ({
        id: String(node.id || ""),
        name: String(node.name || ""),
        type: String(node.__typename || "TaxonomyAttribute"),
        values: [
          ...((node.values?.nodes || []).map((value) => ({
            id: String(value.id || ""),
            name: String(value.name || ""),
          })) || []),
          ...((node.options || []).map((option) => ({
            id: String(option.key || option.value || ""),
            name: String(option.value || option.key || ""),
          })) || []),
        ].filter((value) => value.id && value.name),
      })
    ) || [];
  const templates =
    data?.standardMetafieldDefinitionTemplates?.nodes
      ?.map(
        (node: {
          id?: string;
          name?: string;
          namespace?: string;
          key?: string;
          ownerTypes?: string[];
          type?: { name?: string };
        }) => ({
          id: String(node.id || ""),
          name: String(node.name || ""),
          namespace: String(node.namespace || ""),
          key: String(node.key || ""),
          ownerTypes: Array.isArray(node.ownerTypes) ? node.ownerTypes : [],
          type: String(node.type?.name || ""),
        })
      )
      .filter(
        (template: ShopifyStandardMetafieldTemplate) =>
          template.id &&
          template.namespace &&
          template.key &&
          template.type &&
          template.ownerTypes.includes("PRODUCT")
      ) || [];
  const value = { attributes, templates };

  categoryMetafieldDataCache.set(cacheKey, {
    expiresAt: Date.now() + SHOPIFY_CLIENT_CACHE_TTL_MS,
    value,
  });

  return value;
}

export async function updateProductTaxonomy(
  creds: ShopifyCredentials,
  input: {
    productId: string;
    categoryId?: string | null;
    productType?: string | null;
    metafields?: ShopifyProductMetafieldInput[];
    variantIds?: string[];
  }
) {
  if (!input.categoryId && !input.productType && !input.metafields?.length) {
    return { skipped: true };
  }

  let productResult = null;

  if (input.categoryId || input.productType) {
    const mutation = `
      mutation updateProductTaxonomy($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            title
            productType
            category { id name fullName }
          }
          userErrors { field message }
        }
      }
    `;

    const payload: Record<string, unknown> = { id: input.productId };
    if (input.categoryId) {
      payload.category = input.categoryId;
    }
    if (input.productType) {
      payload.productType = input.productType;
    }

    const result = await shopifyGraphQL(creds, mutation, { product: payload });
    const userErrors = result?.productUpdate?.userErrors as
      | { field?: string[]; message: string }[]
      | undefined;

    if (userErrors && userErrors.length > 0) {
      throw new Error(
        userErrors
          .map((err) =>
            err.field?.length ? `${err.field.join(".")}: ${err.message}` : err.message
          )
          .join(" | ")
      );
    }

    productResult = result?.productUpdate?.product || null;
  }

  let metafieldsResult = null;
  let variantMetafieldsResult = null;
  let metafieldsWarning: string | null = null;

  if (input.metafields?.length) {
    try {
      metafieldsResult = await setProductMetafields(
        creds,
        input.productId,
        input.metafields
      );
    } catch (error) {
      if (!input.categoryId && !input.productType) {
        throw error;
      }

      metafieldsWarning =
        error instanceof Error
          ? `Categoria aplicada, mas metacampos nao foram salvos: ${error.message}`
          : "Categoria aplicada, mas metacampos nao foram salvos.";
    }

    const googleShoppingMetafields = input.metafields.filter(
      (field) => field.namespace === "mm-google-shopping"
    );
    if (input.variantIds?.length && googleShoppingMetafields.length) {
      try {
        variantMetafieldsResult = await setProductVariantMetafields(
          creds,
          input.variantIds,
          googleShoppingMetafields
        );
      } catch (error) {
        const warning =
          error instanceof Error
            ? `Metacampos do produto aplicados, mas metacampos das variantes nao foram salvos: ${error.message}`
            : "Metacampos do produto aplicados, mas metacampos das variantes nao foram salvos.";
        metafieldsWarning = metafieldsWarning
          ? `${metafieldsWarning} ${warning}`
          : warning;
      }
    }
  }

  return {
    ...(productResult || {}),
    metafieldsResult,
    variantMetafieldsResult,
    metafieldsWarning,
  };
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
    categoryId?: string | null;
    productType?: string | null;
    metafields?: {
      namespace: string;
      key: string;
      type: string;
      value: string;
    }[];
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
    mutation productUpdate($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
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
    product: {
      id: input.productId,
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      tags: input.tags,
      seo: input.seo,
      status: nextStatus,
      ...(input.categoryId
        ? { category: input.categoryId }
        : {}),
      ...(input.productType ? { productType: input.productType } : {}),
      ...(input.metafields?.length ? { metafields: input.metafields } : {}),
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
