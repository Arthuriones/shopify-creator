import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMcpToken } from "@/lib/mcp/auth";

export const runtime = "nodejs";

async function userOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await userOr401();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, name, token_suffix, last_used_at, revoked_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await userOr401();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const { raw, hash, suffix } = generateMcpToken();

  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({
      user_id: user.id,
      name: (name || "Claude").slice(0, 60),
      token_hash: hash,
      token_suffix: suffix,
    })
    .select("id, name, token_suffix, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unica vez que o valor em claro sai do servidor.
  return NextResponse.json({ ...data, token: raw });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await userOr401();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  // Revoga em vez de apagar: mantem o rastro de quando foi usado pela ultima vez.
  const { error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
