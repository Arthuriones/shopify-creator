import { NextRequest, NextResponse } from "next/server";
import {
  ShopifyClientError,
  getShopInfo,
  getThemes,
} from "@/lib/shopify/client";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { createClient } from "@/lib/supabase/server";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const body = await request.json();
    payload = typeof body === "object" && body !== null ? body : {};
  } catch {
    return NextResponse.json(
      { error: "Payload invalido. Envie os campos da conexao." },
      { status: 400 }
    );
  }

  const shopDomainInput = asTrimmedString(payload.shopDomain);
  const clientId = asTrimmedString(payload.clientId);
  const clientSecret = asTrimmedString(payload.clientSecret);
  const shopDomain = normalizeShopDomain(shopDomainInput);

  if (!shopDomain || !clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Informe dominio (.myshopify.com), Client ID e Client Secret para conectar.",
      },
      { status: 400 }
    );
  }

  const creds = { shopDomain, clientId, clientSecret };

  try {
    const [shopData, themesData] = await Promise.all([
      getShopInfo(creds),
      getThemes(creds),
    ]);

    const activeTheme = themesData.themes.nodes.find(
      (t: { role: string }) => t.role === "MAIN"
    );

    const { data: store, error } = await supabase
      .from("stores")
      .upsert(
        {
          user_id: user.id,
          shop_domain: shopDomain,
          client_id: clientId,
          client_secret: clientSecret,
          name: shopData.shop.name,
          theme_id: activeTheme?.id || null,
        },
        { onConflict: "user_id,shop_domain" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to save store" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      store,
      shop: shopData.shop,
      theme: activeTheme,
    });
  } catch (error) {
    if (error instanceof ShopifyClientError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error
        ? sanitizeErrorMessage(error.message)
        : "Nao foi possivel conectar a loja agora.";

    return NextResponse.json(
      { error: message || "Nao foi possivel conectar a loja agora." },
      { status: 500 }
    );
  }
}
