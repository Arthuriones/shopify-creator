import { NextRequest, NextResponse } from "next/server";

const SCOPES = [
  "write_legal_policies",
  "write_online_store_navigation",
  "read_products",
  "write_products",
  "read_content",
  "write_content",
  "read_themes",
].join(",");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  // Step 1: Shopify redirects here with ?shop=xxx on install
  // We redirect to Shopify's OAuth authorize page
  if (shop && !searchParams.get("code")) {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "SHOPIFY_CLIENT_ID not set in .env" },
        { status: 500 }
      );
    }

    const redirectUri = `${request.nextUrl.origin}/api/shopify/auth`;
    const authUrl =
      `https://${shop}/admin/oauth/authorize?` +
      `client_id=${clientId}` +
      `&scope=${SCOPES}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return NextResponse.redirect(authUrl);
  }

  // Step 2: Shopify redirects back with ?code=xxx&shop=xxx after merchant approves
  const code = searchParams.get("code");
  const shopDomain = shop;

  if (code && shopDomain) {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set in .env" },
        { status: 500 }
      );
    }

    // Exchange code for access token
    const tokenRes = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { error: `Token exchange failed: ${text}` },
        { status: 500 }
      );
    }

    const data = await tokenRes.json();
    console.log("[OAuth Install] Token response:", JSON.stringify(data, null, 2));

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h1>App instalado com sucesso!</h1>
        <p>Scopes: <code>${data.scope}</code></p>
        <p>Pode fechar esta aba e voltar ao app.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
}
