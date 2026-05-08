import { NextResponse } from "next/server";
import {
  getInstagramAuthMode,
  resolveFacebookInstagramBusinessAccount,
  resolveInstagramBusinessAccount,
} from "@/lib/instagram/meta";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("instagram_connections")
    .select(
      "id, instagram_business_account_id, instagram_username, page_id, page_name, access_token, token_expires_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({
      connected: false,
      error:
        "Tabela instagram_connections nao encontrada. Rode a migration 012_instagram_connections.sql.",
    });
  }

  if (!data) {
    return NextResponse.json({ connected: false, connection: null });
  }

  try {
    const authMode = getInstagramAuthMode();
    const account =
      authMode === "facebook"
        ? await resolveFacebookInstagramBusinessAccount(data.access_token)
        : await resolveInstagramBusinessAccount(data.access_token);
    if (account.instagramBusinessAccountId !== data.instagram_business_account_id) {
      await supabase
        .from("instagram_connections")
        .update({
          instagram_user_id: account.instagramBusinessAccountId,
          instagram_business_account_id: account.instagramBusinessAccountId,
          instagram_username: account.instagramUsername,
          page_name: account.accountType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }

    const { access_token: _accessToken, ...safeConnection } = {
      ...data,
      instagram_business_account_id: account.instagramBusinessAccountId,
      instagram_username: account.instagramUsername,
      page_name: account.accountType,
    };
    return NextResponse.json({ connected: true, connection: safeConnection });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Conexao Instagram invalida.";
    return NextResponse.json({
      connected: false,
      connection: null,
      error:
        "Conexao Instagram invalida. Reconecte usando a Embed URL/Config ID do Instagram Business Login.",
      details: message.slice(0, 180),
    });
  }
}
