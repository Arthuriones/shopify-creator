import { NextRequest, NextResponse } from "next/server";
import { getProducts, type ShopifyCredentials } from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

interface FlatVariant {
  id: string;
  sku: string | null;
}

function numericId(gid: string | number | undefined | null): string | null {
  if (gid === undefined || gid === null) return null;
  const match = String(gid).match(/(\d+)$/);
  return match?.[1] || null;
}

async function getAllVariants(creds: ShopifyCredentials): Promise<FlatVariant[]> {
  const flat: FlatVariant[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const data = await getProducts(creds, { first: 250, after });
    const nodes = data?.products?.nodes || [];
    for (const product of nodes) {
      for (const variant of product.variants?.nodes || []) {
        flat.push({ id: variant.id, sku: variant.sku?.trim() || null });
      }
    }
    const pageInfo = data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }
  return flat;
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
  const routeId = typeof body.id === "string" ? body.id : "";
  if (!routeId) {
    return NextResponse.json({ error: "Id da rota e obrigatorio." }, { status: 400 });
  }

  const { data: config, error: configError } = await supabase
    .from("routed_checkout_configs")
    .select("id, name, sku_map, source_store_id, target_store_id")
    .eq("id", routeId)
    .eq("user_id", user.id)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Rota nao encontrada." }, { status: 404 });
  }

  const { data: stores } = await supabase
    .from("stores")
    .select("id, shop_domain, client_id, client_secret, access_token")
    .in("id", [config.source_store_id, config.target_store_id]);

  const sourceStore = stores?.find((store) => store.id === config.source_store_id);
  const targetStore = stores?.find((store) => store.id === config.target_store_id);
  if (!sourceStore || !targetStore) {
    return NextResponse.json({ error: "Vitrine ou loja checkout nao encontrada." }, { status: 404 });
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
    const [sourceVariants, targetVariants] = await Promise.all([
      getAllVariants(sourceCreds),
      getAllVariants(targetCreds),
    ]);

    const targetSkuIndex = new Map<string, string>(); // lowercase sku -> numeric variant id
    for (const variant of targetVariants) {
      if (variant.sku) {
        const key = variant.sku.toLowerCase();
        if (!targetSkuIndex.has(key)) {
          const id = numericId(variant.id);
          if (id) targetSkuIndex.set(key, id);
        }
      }
    }

    const skuMap = (config.sku_map || {}) as Record<string, string | number>;

    const missingSkus: string[] = [];
    const wrongSkus: { sku: string; expectedVariantId: string | null; mappedVariantId: string }[] = [];
    let checkedCount = 0;

    for (const variant of sourceVariants) {
      if (!variant.sku) continue;
      checkedCount += 1;
      const mapped = skuMap[variant.sku];
      if (mapped === undefined) {
        missingSkus.push(variant.sku);
        continue;
      }
      const expected = targetSkuIndex.get(variant.sku.toLowerCase()) || null;
      const mappedId = numericId(mapped);
      if (expected && mappedId && expected !== mappedId) {
        wrongSkus.push({ sku: variant.sku, expectedVariantId: expected, mappedVariantId: mappedId });
      }
    }

    // Ultimos 7 dias de fallback pro checkout nativo (vitrine sem como
    // cobrar): da visibilidade de quanto e por que a rota esta falhando no
    // momento do clique, em vez de so o mapa estar correto em si.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: fallbacks } = await supabase
      .from("routed_checkout_fallbacks")
      .select("reason, detail, created_at")
      .eq("route_config_id", config.id)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    const fallbackByReason: Record<string, number> = {};
    for (const item of fallbacks || []) {
      fallbackByReason[item.reason] = (fallbackByReason[item.reason] || 0) + 1;
    }

    const ok = missingSkus.length === 0 && wrongSkus.length === 0;

    return NextResponse.json({
      ok,
      checkedAt: new Date().toISOString(),
      totalSourceSkus: checkedCount,
      mappedCount: checkedCount - missingSkus.length,
      missingCount: missingSkus.length,
      missingSkus: missingSkus.slice(0, 50),
      wrongCount: wrongSkus.length,
      wrongSkus: wrongSkus.slice(0, 50),
      fallbackCount7d: fallbacks?.length || 0,
      fallbackByReason,
      recentFallbacks: (fallbacks || []).slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao verificar a rota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
