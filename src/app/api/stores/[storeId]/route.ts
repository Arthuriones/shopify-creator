import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!storeId) {
    return NextResponse.json(
      { error: "storeId e obrigatorio." },
      { status: 400 }
    );
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, user_id")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();

  if (storeError || !store) {
    return NextResponse.json(
      { error: "Loja nao encontrada." },
      { status: 404 }
    );
  }

  try {
    const admin = createAdminClient();

    const { error: jobsError } = await admin
      .from("background_jobs")
      .delete()
      .eq("store_id", store.id)
      .eq("user_id", user.id);

    if (jobsError) {
      return NextResponse.json(
        { error: `Erro ao remover jobs da loja: ${jobsError.message}` },
        { status: 500 }
      );
    }

    const { error: storeDeleteError } = await admin
      .from("stores")
      .delete()
      .eq("id", store.id)
      .eq("user_id", user.id);

    if (storeDeleteError) {
      return NextResponse.json(
        { error: `Erro ao remover loja: ${storeDeleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao remover loja.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


/**
 * Atualiza os campos editaveis da loja (nome, logo, idioma, preco).
 *
 * Aqui em vez de no navegador para a tela de lojas parar de importar o
 * cliente Supabase -- eram 59 KB comprimidos so por causa dessas gravacoes.
 * A allowlist abaixo importa: sem ela, um PATCH poderia mexer em client_id,
 * client_secret ou user_id.
 */
const CAMPOS_EDITAVEIS = [
  "name",
  "logo_path",
  "target_language",
  "currency_code",
  "auto_convert_prices",
  "currency_rate",
  "price_markup_percent",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in body) patch[campo] = body[campo];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Falha ao salvar a loja." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
