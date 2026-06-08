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
  "read_metaobjects",
  "write_metaobjects",
  "read_metaobject_definitions",
  "write_metaobject_definitions",
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

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const storeIdParam = searchParams.get("store_id");

  console.log("[shopify/auth] incoming", {
    hasUser: !!user,
    hasCode: !!code,
    hasShop: !!shop,
    hasState: !!state,
    hasStoreId: !!storeIdParam,
    rawSearch: request.nextUrl.search,
  });

  if (!user) {
    // Preserva os params para retomar depois do login
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set(
      "next",
      `/api/shopify/auth${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  // Step 1: Iniciar OAuth — pode vir como:
  // (a) ?store_id=X (clicou em Conectar no app)
  // (b) ?shop=Y (Shopify redirecionou pro app_url quando o lojista clicou Install no dev.shopify.com)
  if (!code && (storeIdParam || shop)) {
    let store: { id: string; shop_domain: string; client_id: string } | null =
      null;

    if (storeIdParam) {
      const { data } = await supabase
        .from("stores")
        .select("id, shop_domain, client_id")
        .eq("id", storeIdParam)
        .eq("user_id", user.id)
        .single();
      store = data;
    } else if (shop) {
      const normalizedShop = normalizeShopDomain(shop);
      if (!normalizedShop) {
        return NextResponse.redirect(
          dashboardUrl(request, "error=Dominio+invalido+no+install")
        );
      }
      const { data } = await supabase
        .from("stores")
        .select("id, shop_domain, client_id")
        .eq("shop_domain", normalizedShop)
        .eq("user_id", user.id)
        .single();
      store = data;
    }

    if (!store) {
      return NextResponse.redirect(
        dashboardUrl(
          request,
          "error=Cadastre+a+loja+no+app+antes+de+instalar+(preencha+dominio+e+credenciais)."
        )
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

    // Step 2a: Trocar o authorization code por um access token
    // (obrigatório para completar a instalação do app na loja)
    let accessToken = "";
    try {
      const tokenRes = await fetch(
        `https://${store.shop_domain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: store.client_id,
            client_secret: store.client_secret,
            code,
          }),
        }
      );

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error("[shopify/auth] code exchange failed", {
          status: tokenRes.status,
          body: body.slice(0, 300),
        });
        return NextResponse.redirect(
          dashboardUrl(
            request,
            `error=${encodeURIComponent("Falha ao trocar o codigo de autorizacao. Tente conectar novamente.")}`
          )
        );
      }

      const tokenPayload = (await tokenRes.json()) as {
        access_token?: string;
      };
      if (!tokenPayload.access_token) {
        console.error("[shopify/auth] code exchange without access_token");
        return NextResponse.redirect(
          dashboardUrl(
            request,
            `error=${encodeURIComponent("Shopify nao retornou token de acesso. Tente conectar novamente.")}`
          )
        );
      }

      accessToken = tokenPayload.access_token;
      await supabase
        .from("stores")
        .update({ access_token: accessToken })
        .eq("id", store.id);

      // Code exchange succeeded — app is now installed
      console.log("[shopify/auth] code exchange OK for", store.shop_domain);
    } catch (exchangeErr) {
      console.error("[shopify/auth] code exchange error", exchangeErr);
      return NextResponse.redirect(
        dashboardUrl(
          request,
          `error=${encodeURIComponent("Erro de rede ao trocar codigo de autorizacao.")}`
        )
      );
    }

    // Step 2b: Agora o Client Credentials Grant funciona
    const creds = {
      shopDomain: store.shop_domain,
      clientId: store.client_id,
      clientSecret: store.client_secret,
      accessToken,
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

  // Diagnostico mais util do que "Parametros invalidos"
  const missing: string[] = [];
  if (!code && !storeIdParam) missing.push("code/store_id");
  if (code && !shop) missing.push("shop");
  if (code && !state) missing.push("state");

  const errorMsg =
    missing.length > 0
      ? `Callback do Shopify sem parametros: ${missing.join(", ")}. Verifique se a URL de redirecionamento no dev.shopify.com termina exatamente em /api/shopify/auth.`
      : "Parametros invalidos no OAuth";

  return NextResponse.redirect(
    dashboardUrl(request, `error=${encodeURIComponent(errorMsg)}`)
  );
}
