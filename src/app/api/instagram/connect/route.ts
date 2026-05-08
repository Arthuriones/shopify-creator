import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  FACEBOOK_INSTAGRAM_OAUTH_SCOPES,
  getInstagramClientId,
  getInstagramAuthMode,
  INSTAGRAM_OAUTH_SCOPES,
} from "@/lib/instagram/meta";
import { getPublicAppUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function encodeState(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function isConfiguredId(value: string) {
  return /^\d+$/.test(value.trim());
}

export async function GET(request: NextRequest) {
  const authMode = getInstagramAuthMode();
  const appId =
    authMode === "facebook"
      ? process.env.META_APP_ID?.trim() || getInstagramClientId()
      : getInstagramClientId();
  if (!appId || !isConfiguredId(appId)) {
    return NextResponse.redirect(
      new URL(
        "/instagram?error=meta_app_id_invalido_configure_id_numerico_na_vercel",
        request.nextUrl.origin
      )
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const publicUrl = getPublicAppUrl(request.nextUrl.origin);
  const redirectUri = `${publicUrl}/api/instagram/callback`;
  const nonce = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("instagram_oauth_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });

  const popup = request.nextUrl.searchParams.get("popup") === "1";
  const state = encodeState({ userId: user.id, nonce, popup });
  const dashboardEmbedUrl = process.env.INSTAGRAM_EMBED_URL?.trim();
  const url =
    authMode === "facebook"
      ? new URL("https://www.facebook.com/dialog/oauth")
      : new URL(
          dashboardEmbedUrl || "https://www.instagram.com/oauth/authorize"
        );
  if (!url.searchParams.get("client_id")) {
    url.searchParams.set("client_id", appId);
  }
  const configId =
    authMode === "instagram" ? process.env.INSTAGRAM_CONFIG_ID?.trim() : "";
  if (configId && /^\d+$/.test(configId) && !url.searchParams.get("config_id")) {
    url.searchParams.set("config_id", configId);
  }
  if (!url.searchParams.get("redirect_uri")) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  url.searchParams.set("state", state);
  if (!url.searchParams.get("scope")) {
    url.searchParams.set(
      "scope",
      authMode === "facebook"
        ? FACEBOOK_INSTAGRAM_OAUTH_SCOPES
        : INSTAGRAM_OAUTH_SCOPES
    );
  }
  if (!url.searchParams.get("response_type")) {
    url.searchParams.set("response_type", "code");
  }
  if (authMode === "instagram" && !url.searchParams.get("enable_fb_login")) {
    url.searchParams.set("enable_fb_login", "0");
  }

  return NextResponse.redirect(url);
}
