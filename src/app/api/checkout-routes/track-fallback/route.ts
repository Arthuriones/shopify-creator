import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Registra quando o loader da vitrine cai pro checkout nativo em vez de
// rotear pra dark store. Best-effort: nunca deve afetar o fluxo de compra do
// cliente, entao qualquer falha aqui so retorna ok:false em silencio.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "desconhecido";
  const detail = typeof body.detail === "string" ? body.detail.slice(0, 500) : null;
  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 500) : null;

  if (!token) {
    return NextResponse.json({ ok: false }, { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    const { data: config } = await supabase
      .from("routed_checkout_configs")
      .select("id")
      .eq("public_token", token)
      .single();

    if (config?.id) {
      await supabase.from("routed_checkout_fallbacks").insert({
        route_config_id: config.id,
        reason,
        detail,
        page_url: pageUrl,
      });
    }
  } catch {
    // best-effort: nao deixa o log quebrar nada pro cliente
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
