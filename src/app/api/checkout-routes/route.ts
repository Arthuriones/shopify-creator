import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

async function getUserAndClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

async function userOwnsStores(
  storeIds: string[],
  userId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("id", storeIds);

  return !error && count === storeIds.length;
}

export async function GET() {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("routed_checkout_configs")
    .select(
      "id, name, mode, public_token, enabled, source_store_id, target_store_id, sku_map, variant_map, settings, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel carregar configuracoes." },
      { status: 500 }
    );
  }

  return NextResponse.json({ configs: data || [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const mode =
    body.mode === "enterprise" || body.mode === "enterprise_static"
      ? body.mode
      : "standard";

  if (!name || !sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "Nome, loja vitrine e loja checkout sao obrigatorios." },
      { status: 400 }
    );
  }

  if (sourceStoreId === targetStoreId) {
    return NextResponse.json(
      { error: "A vitrine e a loja checkout precisam ser lojas diferentes." },
      { status: 400 }
    );
  }

  const ownsStores = await userOwnsStores([sourceStoreId, targetStoreId], user.id);
  if (!ownsStores) {
    return NextResponse.json(
      { error: "Uma das lojas selecionadas nao pertence ao usuario." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("routed_checkout_configs")
    .insert({
      user_id: user.id,
      source_store_id: sourceStoreId,
      target_store_id: targetStoreId,
      name,
      mode,
      public_token: randomUUID(),
      enabled: body.enabled !== false,
      sku_map: body.skuMap && typeof body.skuMap === "object" ? body.skuMap : {},
      variant_map:
        body.variantMap && typeof body.variantMap === "object"
          ? body.variantMap
          : {},
      settings:
        body.settings && typeof body.settings === "object" ? body.settings : {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel salvar o checkout roteado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ config: data });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const mode =
    body.mode === "enterprise" || body.mode === "enterprise_static"
      ? body.mode
      : "standard";

  if (!id || !name || !sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "Id, nome, loja vitrine e loja checkout sao obrigatorios." },
      { status: 400 }
    );
  }

  if (sourceStoreId === targetStoreId) {
    return NextResponse.json(
      { error: "A vitrine e a loja checkout precisam ser lojas diferentes." },
      { status: 400 }
    );
  }

  const ownsStores = await userOwnsStores([sourceStoreId, targetStoreId], user.id);
  if (!ownsStores) {
    return NextResponse.json(
      { error: "Uma das lojas selecionadas nao pertence ao usuario." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("routed_checkout_configs")
    .update({
      source_store_id: sourceStoreId,
      target_store_id: targetStoreId,
      name,
      mode,
      enabled: body.enabled !== false,
      sku_map: body.skuMap && typeof body.skuMap === "object" ? body.skuMap : {},
      variant_map:
        body.variantMap && typeof body.variantMap === "object"
          ? body.variantMap
          : {},
      settings:
        body.settings && typeof body.settings === "object" ? body.settings : {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Nao foi possivel atualizar o checkout roteado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ config: data });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";

  if (!id) {
    return NextResponse.json(
      { error: "Id da rota e obrigatorio." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("routed_checkout_configs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel excluir a rota." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
