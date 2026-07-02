import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProducts, type ShopifyCredentials } from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ConnectedVariant {
  id: string;
  title?: string;
  sku?: string | null;
  selectedOptions?: { name: string; value: string }[];
}

interface ConnectedProduct {
  id: string;
  title: string;
  variants?: { nodes?: ConnectedVariant[] };
}

interface FlatVariant {
  id: string;
  sku: string | null;
  label: string;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function flattenVariants(products: ConnectedProduct[]): FlatVariant[] {
  const flat: FlatVariant[] = [];
  for (const product of products) {
    for (const variant of product.variants?.nodes || []) {
      const optionLabel = (variant.selectedOptions || [])
        .map((option) => option.value)
        .filter(Boolean)
        .join(" / ");
      flat.push({
        id: variant.id,
        sku: variant.sku?.trim() || null,
        label: `${product.title} ${optionLabel}`.trim(),
      });
    }
  }
  return flat;
}

async function getAllProducts(
  creds: ShopifyCredentials
): Promise<ConnectedProduct[]> {
  const all: ConnectedProduct[] = [];
  let after: string | null = null;
  // Hard cap defensivo: 40 paginas * 250 = 10k produtos.
  for (let page = 0; page < 40; page += 1) {
    const data = await getProducts(creds, { first: 250, after });
    const nodes = (data?.products?.nodes || []) as ConnectedProduct[];
    all.push(...nodes);
    const pageInfo = data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }
  return all;
}

async function getStoreCredentials(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();
  return store;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "Rota por SKU";
  const createRoute = body.createRoute !== false;

  if (!sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "Selecione a vitrine e a loja checkout." },
      { status: 400 }
    );
  }
  if (sourceStoreId === targetStoreId) {
    return NextResponse.json(
      { error: "A vitrine e a loja checkout precisam ser lojas diferentes." },
      { status: 400 }
    );
  }

  const [sourceStore, targetStore] = await Promise.all([
    getStoreCredentials(sourceStoreId, user.id),
    getStoreCredentials(targetStoreId, user.id),
  ]);
  if (!sourceStore || !targetStore) {
    return NextResponse.json(
      { error: "Uma das lojas nao foi encontrada." },
      { status: 404 }
    );
  }

  const sourceCreds: ShopifyCredentials = {
    shopDomain: sourceStore.shop_domain,
    clientId: sourceStore.client_id,
    clientSecret: sourceStore.client_secret,
    accessToken: sourceStore.access_token,
  };
  const targetCreds: ShopifyCredentials = {
    shopDomain: targetStore.shop_domain,
    clientId: targetStore.client_id,
    clientSecret: targetStore.client_secret,
    accessToken: targetStore.access_token,
  };

  try {
    const [sourceProducts, targetProducts] = await Promise.all([
      getAllProducts(sourceCreds),
      getAllProducts(targetCreds),
    ]);

    const sourceVariants = flattenVariants(sourceProducts);
    const targetVariants = flattenVariants(targetProducts);

    const targetBySku = new Map<string, FlatVariant>();
    const targetByLabel = new Map<string, FlatVariant>();
    for (const variant of targetVariants) {
      if (variant.sku) targetBySku.set(variant.sku.toLowerCase(), variant);
      targetByLabel.set(normalizeKey(variant.label), variant);
    }

    const skuMap: Record<string, string> = {};
    const variantMap: Record<string, string> = {};
    let matchedBySku = 0;
    let matchedByLabel = 0;
    const unmatched: string[] = [];

    for (const variant of sourceVariants) {
      const bySku = variant.sku
        ? targetBySku.get(variant.sku.toLowerCase())
        : undefined;
      const target = bySku || targetByLabel.get(normalizeKey(variant.label));
      if (!target) {
        unmatched.push(variant.label || variant.id);
        continue;
      }
      variantMap[variant.id] = target.id;
      if (variant.sku) skuMap[variant.sku] = target.id;
      if (bySku) matchedBySku += 1;
      else matchedByLabel += 1;
    }

    let route: { id?: string; public_token?: string } | null = null;
    if (createRoute && Object.keys(variantMap).length > 0) {
      const { data, error } = await supabase
        .from("routed_checkout_configs")
        .insert({
          user_id: user.id,
          source_store_id: sourceStoreId,
          target_store_id: targetStoreId,
          name,
          mode: "enterprise_static",
          public_token: randomUUID(),
          enabled: true,
          sku_map: skuMap,
          variant_map: variantMap,
          settings: { generatedBy: "connect_by_sku" },
        })
        .select("id, public_token")
        .single();
      if (error) {
        return NextResponse.json(
          { error: "Variantes casadas, mas falhou ao criar a rota." },
          { status: 500 }
        );
      }
      route = data;
    }

    return NextResponse.json({
      sourceVariantCount: sourceVariants.length,
      targetVariantCount: targetVariants.length,
      matchedCount: Object.keys(variantMap).length,
      matchedBySku,
      matchedByLabel,
      unmatchedCount: unmatched.length,
      skuMap,
      variantMap,
      route,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao conectar por SKU.",
      },
      { status: 500 }
    );
  }
}
