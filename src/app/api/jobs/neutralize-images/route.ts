import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getImageQueueProgress,
  processImageNeutralizeJobs,
  requestImageQueueDrain,
} from "@/lib/jobs/image-neutralize-processor";

export const runtime = "nodejs";
export const maxDuration = 300;

async function getAuthenticated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET ?storeId= -> contadores da fila para a barra de progresso.
export async function GET(request: NextRequest) {
  const { user } = await getAuthenticated();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = request.nextUrl.searchParams.get("storeId");
  if (!storeId) {
    return NextResponse.json({ error: "storeId obrigatorio." }, { status: 400 });
  }

  const progress = await getImageQueueProgress({ userId: user.id, storeId });
  return NextResponse.json({ progress });
}

// POST { storeId } -> dispara um ciclo de drenagem da fila em background.
export async function POST(request: NextRequest) {
  const { user } = await getAuthenticated();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  if (!storeId) {
    return NextResponse.json({ error: "storeId obrigatorio." }, { status: 400 });
  }

  const userId = user.id;
  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") || "";

  after(async () => {
    try {
      const result = await processImageNeutralizeJobs({ userId, storeId });
      // Se a fila ainda tem trabalho (estourou o orcamento de tempo desta
      // invocacao), encadeia outra invocacao serverless para continuar
      // drenando ate esvaziar — sem depender do cliente. So encadeia se houve
      // progresso: evita loop infinito quando nada pode ser processado (ex.:
      // credenciais da loja removidas).
      if (result.remaining > 0 && result.processed > 0) {
        await requestImageQueueDrain({ origin, cookie, storeId, chain: true });
      }
    } catch (error) {
      console.error("[api/jobs/neutralize-images] process error", error);
    }
  });

  const progress = await getImageQueueProgress({ userId, storeId });
  return NextResponse.json({ ok: true, progress });
}
