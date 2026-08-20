import { NextRequest, NextResponse } from "next/server";
import { healRoute, HealRouteError } from "@/lib/checkout-routes/heal";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Conserto manual de uma rota, disparado pelo botao "Corrigir".
// A logica mora em @/lib/checkout-routes/heal porque o cron roda a mesma coisa
// sozinho de hora em hora (ver /api/jobs/routes/heal).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const routeId = typeof body.id === "string" ? body.id : "";
  if (!routeId) {
    return NextResponse.json(
      { error: "Id da rota e obrigatorio." },
      { status: 400 }
    );
  }

  try {
    const result = await healRoute({
      routeId,
      // Escopo do dono: healRoute filtra por user_id, entao rota de outro
      // usuario devolve 404 em vez de ser consertada.
      userId: user.id,
      origin: request.nextUrl.origin,
      cookie: request.headers.get("cookie") || "",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HealRouteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao corrigir a rota.",
      },
      { status: 500 }
    );
  }
}
