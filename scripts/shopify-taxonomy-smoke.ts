import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import {
  getProductById,
  type ShopifyCredentials,
  updateProductTaxonomy,
} from "@/lib/shopify/client";
import { buildShopifyTaxonomyEnrichment } from "@/lib/products/shopify-taxonomy-enrichment";

type StoreRow = {
  id: string;
  name: string;
  shop_domain: string;
  client_id: string;
  client_secret: string;
  access_token?: string | null;
  niche?: string | null;
  target_audience?: string | null;
  brand_voice?: string | null;
  store_description?: string | null;
  target_language?: string | null;
};

type GraphQLMetafieldNode = {
  namespace?: string;
  key?: string;
  type?: string;
  value?: string;
};

type GraphQLProductSnapshot = {
  id: string;
  title: string;
  productType?: string | null;
  category?: { id?: string; name?: string; fullName?: string } | null;
  metafields?: { nodes?: GraphQLMetafieldNode[] };
  variants?: {
    nodes?: {
      id?: string;
      title?: string;
      selectedOptions?: { name: string; value: string }[];
      metafields?: { nodes?: GraphQLMetafieldNode[] };
    }[];
  };
};

function getArg(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function googleFields(
  metafields:
    | {
        nodes?: { namespace?: string; key?: string; type?: string; value?: string }[];
      }
    | null
    | undefined
) {
  return (metafields?.nodes || []).filter(
    (field) => field.namespace === "mm-google-shopping"
  );
}

async function fetchShopifyAccessToken(store: StoreRow) {
  if (store.access_token) return store.access_token;

  const response = await fetch(`https://${store.shop_domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: store.client_id,
      client_secret: store.client_secret,
    }),
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(json.error || "Could not fetch Shopify access token");
  }
  return json.access_token as string;
}

async function fetchProductSnapshot(store: StoreRow, productId: string) {
  const token = await fetchShopifyAccessToken(store);
  const query = `query Product($id: ID!) {
    product(id: $id) {
      id
      title
      productType
      category { id name fullName }
      metafields(first: 100) { nodes { namespace key type value } }
      variants(first: 100) {
        nodes {
          id
          title
          selectedOptions { name value }
          metafields(first: 30) { nodes { namespace key type value } }
        }
      }
    }
  }`;
  const response = await fetch(
    `https://${store.shop_domain}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables: { id: productId } }),
    }
  );
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((error: { message: string }) => error.message).join(" | "));
  }
  return json.data?.product as GraphQLProductSnapshot | null;
}

async function fetchAccessScopes(store: StoreRow) {
  const token = await fetchShopifyAccessToken(store);
  const query = `query Scopes { currentAppInstallation { accessScopes { handle } } }`;
  const response = await fetch(
    `https://${store.shop_domain}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query }),
    }
  );
  const json = await response.json();
  return (
    json.data?.currentAppInstallation?.accessScopes?.map(
      (scope: { handle: string }) => scope.handle
    ) || []
  );
}

async function main() {
  loadEnvFile();

  const productId =
    getArg("--product") || "gid://shopify/Product/9392536027373";
  const storeName = getArg("--store") || "Vessa";

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("name", storeName)
    .single<StoreRow>();
  if (storeError || !store) {
    throw new Error(storeError?.message || `Store not found: ${storeName}`);
  }

  const creds: ShopifyCredentials = {
    shopDomain: store.shop_domain,
    clientId: store.client_id,
    clientSecret: store.client_secret,
    accessToken: store.access_token,
  };
  const accessScopes = await fetchAccessScopes(store);

  const before = await getProductById(creds, productId);
  if (!before) throw new Error(`Product not found: ${productId}`);
  const beforeSnapshot = await fetchProductSnapshot(store, productId);
  if (!beforeSnapshot) throw new Error(`Snapshot not found: ${productId}`);

  const taxonomy = await buildShopifyTaxonomyEnrichment({
    creds,
    enabled: true,
    useAiFallback: false,
    context: store.niche
      ? {
          name: store.name,
          niche: store.niche,
          targetAudience: store.target_audience || "",
          brandVoice: store.brand_voice || "",
          storeDescription: store.store_description || "",
          targetLanguage: store.target_language || "pt-BR",
        }
      : null,
    product: {
      title: before.title,
      descriptionHtml: before.descriptionHtml,
      tags: before.tags || [],
      productType: before.productType,
      sourceCategory: before.category?.fullName || before.productType || null,
      sourceAttributes: [
        ...((before.options || []).map((option: { name: string; values?: string[] }) => ({
          name: option.name,
          value: (option.values || []).join(", "),
        })) || []),
        ...((before.metafields?.nodes || [])
          .filter(
            (field: { namespace?: string; key?: string; value?: string }) =>
              field.namespace === "custom" && field.key && field.value
          )
          .map((field: { key: string; value: string }) => ({
            name: field.key,
            value: field.value,
          })) || []),
      ],
      images: before.images?.nodes || [],
      options: before.options || [],
      variants:
        before.variants?.nodes?.map(
          (variant: {
            title?: string;
            selectedOptions?: { name: string; value: string }[];
          }) => ({
            title: variant.title,
            selectedOptions: variant.selectedOptions,
          })
        ) || [],
    },
  });

  const variantIds =
    before.variants?.nodes
      ?.map((variant: { id?: string }) => variant.id)
      .filter((id: string | undefined): id is string => Boolean(id)) || [];

  const applyResult = await updateProductTaxonomy(creds, {
    productId,
    categoryId: taxonomy.category?.id || null,
    productType: taxonomy.productType || before.productType || null,
    metafields: taxonomy.metafields,
    variantIds,
  });

  const after = await getProductById(creds, productId);
  if (!after) throw new Error(`Product missing after apply: ${productId}`);
  const afterSnapshot = await fetchProductSnapshot(store, productId);
  if (!afterSnapshot) throw new Error(`Snapshot missing after apply: ${productId}`);

  const beforeGoogle = googleFields(beforeSnapshot.metafields);
  const afterGoogle = googleFields(afterSnapshot.metafields);
  const variantSummary =
    afterSnapshot.variants?.nodes?.map((variant) => ({
        id: variant.id,
        title: variant.title,
        googleMetafields: googleFields(variant.metafields),
      })
    ) || [];

  const result = {
    store: {
      id: store.id,
      name: store.name,
      domain: store.shop_domain,
      accessTokenStored: Boolean(store.access_token),
      accessScopes,
    },
    product: {
      id: after.id,
      title: after.title,
      category: after.category?.fullName || null,
      productType: after.productType || null,
    },
    proposal: {
      category: taxonomy.category?.fullName || taxonomy.categorySearch || null,
      productType: taxonomy.productType || null,
      metafields: taxonomy.metafields.map((field) => ({
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: field.value,
        displayValue: field.displayValue || null,
      })),
    },
    applyResult,
    before: {
      googleMetafields: beforeGoogle,
    },
    after: {
      googleMetafields: afterGoogle,
      variantsWithGoogleMetafields: variantSummary.filter(
        (variant) => variant.googleMetafields.length > 0
      ).length,
      variantSummary: variantSummary.slice(0, 5),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
