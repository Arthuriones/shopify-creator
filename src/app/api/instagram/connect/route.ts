import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { INSTAGRAM_OAUTH_SCOPES } from "@/lib/instagram/meta";
import { getPublicAppUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function encodeState(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/instagram?error=meta_app_id_missing", request.nextUrl.origin)
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

  const state = encodeState({ userId: user.id, nonce });
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", INSTAGRAM_OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url);
}
