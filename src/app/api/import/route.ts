import { NextRequest, NextResponse } from "next/server";
import { importFromSource } from "@/lib/import/source-adapters";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const source = typeof body.source === "string" ? body.source.trim() : "";

  if (!source) {
    return NextResponse.json(
      { error: "Informe uma URL ou dominio de origem." },
      { status: 400 }
    );
  }

  try {
    const result = await importFromSource({
      source,
      sourceType: body.sourceType || "auto",
      limit: Number(body.limit || 50),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao importar origem.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
