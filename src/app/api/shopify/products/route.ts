import { NextRequest, NextResponse } from "next/server";
import {
  createProduct,
  getProducts,
  updateShopifyProduct,
} from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

async function getStoreCredentials(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, client_id, client_secret")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  return store;
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = request.nextUrl.searchParams.get("storeId") || "";
  const statusRaw = request.nextUrl.searchParams.get("status");
  const firstRaw = Number(request.nextUrl.searchParams.get("first") || "50");
  const search = request.nextUrl.searchParams.get("search") || "";

  if (!storeId) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 });
  }

  const store = await getStoreCredentials(storeId, userId);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const status =
    statusRaw === "ACTIVE" || statusRaw === "DRAFT" || statusRaw === "ARCHIVED"
      ? statusRaw
      : undefined;

  try {
    const result = await getProducts(
      {
        shopDomain: store.shop_domain,
        clientId: store.client_id,
        clientSecret: store.client_secret,
      },
      {
        first: Number.isFinite(firstRaw) ? firstRaw : 50,
        status,
        query: search,
      }
    );

    return NextResponse.json({ products: result.products.nodes });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeId, product } = await request.json();

  if (!storeId || !product) {
    return NextResponse.json(
      { error: "storeId and product are required" },
      { status: 400 }
    );
  }

  const store = await getStoreCredentials(storeId, userId);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    const result = await createProduct(
      {
        shopDomain: store.shop_domain,
        clientId: store.client_id,
        clientSecret: store.client_secret,
      },
      product
    );

    const storefrontPublication = result?.storefrontPublication as
      | { ok?: boolean; reason?: string }
      | undefined;
    if (product?.publishToStorefront !== false && storefrontPublication?.ok === false) {
      console.warn("[api/shopify/products][POST] publish failed", {
        storeId,
        shopDomain: store.shop_domain,
        productTitle: product?.title,
        reason: storefrontPublication.reason,
      });
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[api/shopify/products][POST] error", {
      storeId,
      shopDomain: store.shop_domain,
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error ? error.message : "Product creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeId, productId, updates } = await request.json();

  if (!storeId || !productId || !updates) {
    return NextResponse.json(
      { error: "storeId, productId and updates are required" },
      { status: 400 }
    );
  }

  const store = await getStoreCredentials(storeId, userId);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    const result = await updateShopifyProduct(
      {
        shopDomain: store.shop_domain,
        clientId: store.client_id,
        clientSecret: store.client_secret,
      },
      {
        productId,
        title: updates.title || "",
        descriptionHtml: updates.descriptionHtml || "",
        tags: Array.isArray(updates.tags) ? updates.tags : [],
        seo: updates.seo,
        status:
          updates.status === "ACTIVE" ||
          updates.status === "DRAFT" ||
          updates.status === "ARCHIVED"
            ? updates.status
            : undefined,
        variants: Array.isArray(updates.variants)
          ? updates.variants
              .filter(
                (variant: { id?: unknown; price?: unknown }) =>
                  variant?.id && variant?.price
              )
              .map((variant: { id: unknown; price: unknown; compareAtPrice?: unknown }) => ({
                id: String(variant.id),
                price: String(variant.price),
                compareAtPrice:
                  variant.compareAtPrice === null ||
                  variant.compareAtPrice === undefined ||
                  variant.compareAtPrice === ""
                    ? null
                    : String(variant.compareAtPrice),
              }))
          : undefined,
        publishToStorefront: updates.publishToStorefront !== false,
      }
    );

    const storefrontPublication = result?.storefrontPublication as
      | { ok?: boolean; reason?: string }
      | undefined;
    if (updates?.publishToStorefront !== false && storefrontPublication?.ok === false) {
      console.warn("[api/shopify/products][PUT] publish failed", {
        storeId,
        shopDomain: store.shop_domain,
        productId,
        reason: storefrontPublication.reason,
      });
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[api/shopify/products][PUT] error", {
      storeId,
      shopDomain: store.shop_domain,
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error ? error.message : "Product update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
