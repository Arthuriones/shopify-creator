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

  if (!shopDomain) {
    return NextResponse.json(
      { error: "Domínio da loja inválido ou não informado. Use o formato loja.myshopify.com ou seu domínio customizado." },
      { status: 400 }
    );
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Client ID e Client Secret são obrigatórios para a conexão." },
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
          access_token: null,
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
    // Caso o app ainda nao tenha sido instalado nessa loja:
    // salva as credenciais (para retomar no callback do OAuth)
    // e devolve a URL de instalacao pro frontend redirecionar.
    if (
      error instanceof ShopifyClientError &&
      error.code === "INVALID_CREDENTIALS" &&
      /nao esta instalado|application_cannot_be_found/i.test(error.message)
    ) {
      const { data: store, error: upsertError } = await supabase
        .from("stores")
        .upsert(
          {
            user_id: user.id,
            shop_domain: shopDomain,
            client_id: clientId,
            client_secret: clientSecret,
            access_token: null,
            name: shopDomain,
          },
          { onConflict: "user_id,shop_domain" }
        )
        .select("id")
        .single();

      if (upsertError || !store) {
        return NextResponse.json(
          { error: "Falha ao salvar credenciais para iniciar a instalacao." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        needsInstall: true,
        installUrl: `/api/shopify/auth?store_id=${store.id}`,
        message:
          "App ainda nao instalado nessa loja. Vamos abrir a tela de autorizacao do Shopify.",
      });
    }

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
