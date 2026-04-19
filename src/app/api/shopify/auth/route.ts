import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopInfo, getThemes } from "@/lib/shopify/client";
import { normalizeShopDomain } from "@/lib/shopify/domain";

const SCOPES = [
  "write_legal_policies",
  "write_online_store_navigation",
  "read_products",
  "write_products",
  "read_publications",
  "write_publications",
  "read_content",
  "write_content",
  "read_themes",
].join(",");

function dashboardUrl(request: NextRequest, query?: string): string {
  const url = new URL("/stores", request.nextUrl.origin);
  if (query) url.search = query;
  return url.toString();
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const storeIdParam = searchParams.get("store_id");

  // Step 1: Iniciar OAuth — chamado com ?store_id=X
  if (storeIdParam && !code) {
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, shop_domain, client_id")
      .eq("id", storeIdParam)
      .eq("user_id", user.id)
      .single();

    if (error || !store) {
      return NextResponse.redirect(
        dashboardUrl(request, "error=Loja+nao+encontrada")
      );
    }

    const redirectUri = `${request.nextUrl.origin}/api/shopify/auth`;
    const authUrl =
      `https://${store.shop_domain}/admin/oauth/authorize?` +
      `client_id=${encodeURIComponent(store.client_id)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(store.id)}`;

    return NextResponse.redirect(authUrl);
  }

  // Step 2: Callback do Shopify — vem com ?code=X&shop=Y&state=Z
  if (code && shop && state) {
    const normalizedShop = normalizeShopDomain(shop);
    if (!normalizedShop) {
      return NextResponse.redirect(
        dashboardUrl(request, "error=Dominio+invalido+no+callback")
      );
    }

    const { data: store, error } = await supabase
      .from("stores")
      .select("id, shop_domain, client_id, client_secret")
      .eq("id", state)
      .eq("user_id", user.id)
      .single();

    if (error || !store) {
      return NextResponse.redirect(
        dashboardUrl(request, "error=Sessao+de+instalacao+invalida")
      );
    }

    if (store.shop_domain !== normalizedShop) {
      return NextResponse.redirect(
        dashboardUrl(request, "error=Loja+do+callback+nao+confere")
      );
    }

    // App instalado — agora Client Credentials Grant funciona
    const creds = {
      shopDomain: store.shop_domain,
      clientId: store.client_id,
      clientSecret: store.client_secret,
    };

    try {
      const [shopData, themesData] = await Promise.all([
        getShopInfo(creds),
        getThemes(creds),
      ]);

      const activeTheme = themesData.themes.nodes.find(
        (t: { role: string }) => t.role === "MAIN"
      );

      await supabase
        .from("stores")
        .update({
          name: shopData.shop.name,
          theme_id: activeTheme?.id || null,
        })
        .eq("id", store.id);

      return NextResponse.redirect(
        dashboardUrl(request, "installed=1")
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro pos-instalacao";
      return NextResponse.redirect(
        dashboardUrl(request, `error=${encodeURIComponent(message.slice(0, 200))}`)
      );
    }
  }

  return NextResponse.redirect(
    dashboardUrl(request, "error=Parametros+invalidos+no+OAuth")
  );
}
