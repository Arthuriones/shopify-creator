import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeFacebookCodeForUserToken,
  exchangeCodeForUserToken,
  exchangeForLongLivedFacebookToken,
  exchangeForLongLivedToken,
  getInstagramAuthMode,
  resolveFacebookInstagramBusinessAccount,
  resolveInstagramBusinessAccount,
} from "@/lib/instagram/meta";
import { getPublicAppUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function decodeState(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      userId?: string;
      nonce?: string;
      popup?: boolean;
    };
  } catch {
    return {};
  }
}

function dashboardRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/instagram", request.nextUrl.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

function popupResponse(request: NextRequest, params: Record<string, string>) {
  const payload = JSON.stringify({
    type: "shopify-creator:instagram-oauth",
    ...params,
  }).replace(/</g, "\\u003c");
  const targetOrigin = JSON.stringify(request.nextUrl.origin);

  return new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Instagram conectado</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1412; color: #f8faf7; }
      main { max-width: 360px; padding: 28px; text-align: center; }
      p { color: #b9c2bd; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Conexao concluida</h1>
      <p>Voce ja pode voltar ao Shopify Creator. Esta janela sera fechada automaticamente.</p>
    </main>
    <script>
      const payload = ${payload};
      if (window.opener) {
        window.opener.postMessage(payload, ${targetOrigin});
      }
      setTimeout(() => window.close(), 350);
    </script>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const stateRaw = request.nextUrl.searchParams.get("state") || "";
  const error =
    request.nextUrl.searchParams.get("error_description") ||
    request.nextUrl.searchParams.get("error") ||
    request.nextUrl.searchParams.get("message");

  const cookieStore = await cookies();
  const state = stateRaw ? decodeState(stateRaw) : {};
  const isPopup = Boolean(state.popup);

  const finish = (params: Record<string, string>) =>
    isPopup ? popupResponse(request, params) : dashboardRedirect(request, params);

  if (error) {
    return finish({ error });
  }
  if (!code) {
    return finish({ error: "oauth_callback_invalido" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return finish({ error: "sessao_expirada" });
  }

  if (stateRaw) {
    const nonce = cookieStore.get("instagram_oauth_nonce")?.value;
    if (!nonce || !state.nonce || nonce !== state.nonce) {
      return finish({ error: "oauth_state_invalido" });
    }
    if (state.userId && user.id !== state.userId) {
      return finish({ error: "sessao_expirada" });
    }
  }

  try {
    const publicUrl = getPublicAppUrl(request.nextUrl.origin);
    const redirectUri = `${publicUrl}/api/instagram/callback`;
    const authMode = getInstagramAuthMode();
    const shortToken =
      authMode === "facebook"
        ? await exchangeFacebookCodeForUserToken({ code, redirectUri })
        : await exchangeCodeForUserToken({ code, redirectUri });
    let token = shortToken;
    try {
      token =
        authMode === "facebook"
          ? await exchangeForLongLivedFacebookToken(shortToken.access_token)
          : await exchangeForLongLivedToken(shortToken.access_token);
    } catch (tokenError) {
      console.warn("[instagram/callback] long lived token exchange failed", {
        error: tokenError instanceof Error ? tokenError.message : String(tokenError),
      });
    }

    const account =
      authMode === "facebook"
        ? await resolveFacebookInstagramBusinessAccount(token.access_token)
        : await resolveInstagramBusinessAccount(token.access_token);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase
      .from("instagram_connections")
      .upsert(
        {
          user_id: user.id,
          instagram_user_id: account.instagramBusinessAccountId,
          instagram_business_account_id: account.instagramBusinessAccountId,
          instagram_username: account.instagramUsername,
          page_id: "pageId" in account ? account.pageId : null,
          page_name: account.accountType,
          access_token: token.access_token,
          page_access_token:
            "pageAccessToken" in account ? account.pageAccessToken : null,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,instagram_business_account_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    cookieStore.delete("instagram_oauth_nonce");
    return finish({ connected: "1" });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Falha ao conectar Instagram.";
    return finish({ error: message.slice(0, 160) });
  }
}
