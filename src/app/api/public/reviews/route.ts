import { NextRequest, NextResponse } from "next/server";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers || {}),
    },
  });
}

function cleanHost(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function productIdCandidates(value: string) {
  const clean = value.trim();
  const numeric = clean.match(/Product\/(\d+)$/)?.[1] || clean.match(/^(\d+)$/)?.[1] || "";
  return Array.from(
    new Set(
      [clean, numeric ? `gid://shopify/Product/${numeric}` : "", numeric].filter(Boolean)
    )
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const shop = cleanHost(request.nextUrl.searchParams.get("shop") || "");
  const host = cleanHost(request.nextUrl.searchParams.get("host") || "");
  const productId = request.nextUrl.searchParams.get("productId") || "";
  const handle = request.nextUrl.searchParams.get("handle") || "";
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || "12"), 1), 24);

  if (!shop && !host) {
    return json({ reviews: [] });
  }

  const normalizedShop = normalizeShopDomain(shop);
  const normalizedHost = normalizeShopDomain(host);
  const candidates = Array.from(
    new Set([shop, host, normalizedShop, normalizedHost].filter(Boolean))
  );

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, shop_domain, target_language")
    .in("shop_domain", candidates)
    .limit(1)
    .maybeSingle();

  if (!store?.id) {
    return json({ reviews: [] });
  }

  const { data, error } = await admin
    .from("ai_product_reviews")
    .select(
      "id, product_id, product_numeric_id, product_handle, product_title, customer_name, rating, title, body, product_use_case, disclosure, image_url, created_at"
    )
    .eq("store_id", store.id)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return json({ error: "Nao foi possivel carregar reviews." }, { status: 500 });
  }

  const ids = productIdCandidates(productId);
  const cleanHandle = handle.trim().toLowerCase();
  const reviews = (data || [])
    .filter((review) => {
      const byId =
        ids.length > 0 &&
        ids.some(
          (candidate) =>
            candidate === review.product_id || candidate === review.product_numeric_id
        );
      const byHandle =
        cleanHandle &&
        review.product_handle &&
        review.product_handle.toLowerCase() === cleanHandle;
      return byId || byHandle;
    })
    .slice(0, limit)
    .map((review) => ({
      id: review.id,
      productTitle: review.product_title,
      customerName: review.customer_name,
      rating: review.rating,
      title: review.title,
      body: review.body,
      productUseCase: review.product_use_case,
      disclosure: review.disclosure,
      imageUrl: review.image_url,
    }));

  return json({
    store: {
      name: store.name,
      language: store.target_language || "pt-BR",
    },
    reviews,
  });
}
