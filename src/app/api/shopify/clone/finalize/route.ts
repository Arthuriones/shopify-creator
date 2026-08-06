import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Registra UMA linha em clone_runs com o resultado agregado de uma importacao
 * em lote.
 *
 * O cliente processa a importacao em lotes de 5 produtos e mandava
 * `recordRun: false` em todos eles (para nao gerar uma linha por lote). O
 * efeito colateral era que a importacao em massa — justamente a que importa —
 * nao gerava historico nenhum: a tela de "Execucoes recentes" ficava vazia
 * exatamente para as rodadas maiores.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceDomain =
    typeof body.sourceDomain === "string" ? body.sourceDomain.trim() : "";
  if (!sourceDomain) {
    return NextResponse.json(
      { error: "sourceDomain e obrigatorio." },
      { status: 400 }
    );
  }

  const targetStoreId =
    typeof body.targetStoreId === "string" && body.targetStoreId
      ? body.targetStoreId
      : null;

  // Confere que a loja destino e do proprio usuario antes de referenciar.
  if (targetStoreId) {
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("id", targetStoreId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!store) {
      return NextResponse.json(
        { error: "Loja destino nao encontrada." },
        { status: 404 }
      );
    }
  }

  const toCount = (value: unknown) => {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
  };

  const createdCount = toCount(body.createdCount);
  const skippedCount = toCount(body.skippedCount);
  const failedCount = toCount(body.failedCount);
  const failures = Array.isArray(body.failures)
    ? body.failures.slice(0, 100)
    : [];

  const { error } = await supabase.from("clone_runs").insert({
    user_id: user.id,
    source_domain: sourceDomain,
    target_store_id: targetStoreId,
    action: "apply",
    status: failedCount > 0 && createdCount === 0 ? "failed" : "completed",
    product_count: createdCount,
    result: {
      createdCount,
      skippedCount,
      failedCount,
      neutralizedCount: toCount(body.neutralizedCount),
      logoAppliedCount: toCount(body.logoAppliedCount),
      failures,
      batched: true,
    },
    error: failures.length ? `${failures.length} produto(s) falharam.` : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
