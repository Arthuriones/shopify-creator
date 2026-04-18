import { NextRequest, NextResponse } from "next/server";
import {
  updateStorePolicies,
  createMenu,
  createPages,
} from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";
import type { StoreSetup } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeId, setup } = (await request.json()) as {
    storeId: string;
    setup: StoreSetup;
  };

  if (!storeId || !setup) {
    return NextResponse.json(
      { error: "storeId and setup are required" },
      { status: 400 }
    );
  }

  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, client_id, client_secret")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const creds = {
    shopDomain: store.shop_domain,
    clientId: store.client_id,
    clientSecret: store.client_secret,
  };

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  function errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  // 1. Publish policies
  try {
    results.policies = await updateStorePolicies(creds, setup.policies);
  } catch (error) {
    console.error("[shopify/setup] Policies error:", error);
    errors.push(`Politicas: ${errorMsg(error)}`);
  }

  // 2. Create pages
  try {
    results.pages = await createPages(creds, setup.pages);
  } catch (error) {
    console.error("[shopify/setup] Pages error:", error);
    errors.push(`Paginas: ${errorMsg(error)}`);
  }

  // 3. Create main menu
  try {
    results.mainMenu = await createMenu(creds, setup.mainMenu);
  } catch (error) {
    console.error("[shopify/setup] Main menu error:", error);
    errors.push(`Menu principal: ${errorMsg(error)}`);
  }

  // 4. Create footer menu
  try {
    results.footerMenu = await createMenu(creds, setup.footerMenu);
  } catch (error) {
    console.error("[shopify/setup] Footer menu error:", error);
    errors.push(`Menu footer: ${errorMsg(error)}`);
  }

  return NextResponse.json({
    results,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0,
  });
}
