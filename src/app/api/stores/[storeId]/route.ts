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
