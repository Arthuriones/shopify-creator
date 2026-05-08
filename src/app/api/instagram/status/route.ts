import { NextResponse } from "next/server";
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
      "id, instagram_business_account_id, instagram_username, page_id, page_name, token_expires_at, created_at, updated_at"
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

  return NextResponse.json({ connected: Boolean(data), connection: data || null });
}
