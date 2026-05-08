import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedToken,
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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const stateRaw = request.nextUrl.searchParams.get("state") || "";
  const error = request.nextUrl.searchParams.get("error_description");

  if (error) {
    return dashboardRedirect(request, { error });
  }
  if (!code || !stateRaw) {
    return dashboardRedirect(request, { error: "oauth_callback_invalido" });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get("instagram_oauth_nonce")?.value;
  const state = decodeState(stateRaw);
  if (!nonce || !state.nonce || nonce !== state.nonce) {
    return dashboardRedirect(request, { error: "oauth_state_invalido" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== state.userId) {
    return dashboardRedirect(request, { error: "sessao_expirada" });
  }

  try {
    const publicUrl = getPublicAppUrl(request.nextUrl.origin);
    const redirectUri = `${publicUrl}/api/instagram/callback`;
    const shortToken = await exchangeCodeForUserToken({ code, redirectUri });
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const account = await resolveInstagramBusinessAccount(longToken.access_token);
    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase
      .from("instagram_connections")
      .upsert(
        {
          user_id: user.id,
          instagram_user_id: account.instagramBusinessAccountId,
          instagram_business_account_id: account.instagramBusinessAccountId,
          instagram_username: account.instagramUsername,
          page_id: account.pageId,
          page_name: account.pageName,
          access_token: longToken.access_token,
          page_access_token: account.pageAccessToken || null,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,instagram_business_account_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    cookieStore.delete("instagram_oauth_nonce");
    return dashboardRedirect(request, { connected: "1" });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Falha ao conectar Instagram.";
    return dashboardRedirect(request, { error: message.slice(0, 160) });
  }
}
