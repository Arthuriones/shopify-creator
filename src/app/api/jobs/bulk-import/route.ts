import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { processBulkImportJobs } from "@/lib/jobs/bulk-import-processor";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

async function getAuthenticated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthenticated();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = request.nextUrl.searchParams.get("storeId");
  let query = supabase
    .from("background_jobs")
    .select("id, store_id, type, status, progress, result, error, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("type", "bulk_import")
    .order("created_at", { ascending: false })
    .limit(50);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel carregar jobs." },
      { status: 500 }
    );
  }

  return NextResponse.json({ jobs: data || [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthenticated();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const sources: string[] = Array.isArray(body.sources)
    ? body.sources.map((source: unknown) => String(source).trim()).filter(Boolean)
    : [];
  const optimize = body.optimize === true || body.translateProduct === true;
  const publishToStorefront = body.publishToStorefront !== false;
  const perSourceLimit = Math.min(Math.max(Number(body.perSourceLimit || 1), 1), 250);
  const inventoryMode = body.inventoryMode === "tracked" ? "tracked" : "not_tracked";
  const inventoryQuantityRaw = Number(body.inventoryQuantity ?? 0);
  const inventoryQuantity =
    inventoryMode === "tracked" && Number.isFinite(inventoryQuantityRaw)
      ? Math.max(0, Math.floor(inventoryQuantityRaw))
      : undefined;
  const sourceType =
    body.sourceType === "aliexpress" || body.sourceType === "shopify_public"
      ? body.sourceType
      : "auto";

  if (!storeId || sources.length === 0) {
    return NextResponse.json(
      { error: "storeId e sources sao obrigatorios." },
      { status: 400 }
    );
  }

  if (sources.length > 20) {
    return NextResponse.json(
      { error: "Maximo de 20 origens por lote." },
      { status: 400 }
    );
  }

  const { count: storeCount, error: storeError } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("id", storeId)
    .eq("user_id", user.id);

  if (storeError || storeCount !== 1) {
    return NextResponse.json(
      { error: "Loja de destino nao encontrada." },
      { status: 404 }
    );
  }

  const { data: insertedJobs, error: insertError } = await supabase
    .from("background_jobs")
    .insert(
      sources.map((source) => ({
        user_id: user.id,
        store_id: storeId,
        type: "bulk_import",
        status: "pending",
        progress: {
          source,
          sourceType,
          optimize,
          publishToStorefront,
          perSourceLimit,
          inventoryMode,
          inventoryQuantity,
          step: "Aguardando processamento",
        },
      }))
    )
    .select("id, progress");

  if (insertError || !insertedJobs) {
    return NextResponse.json(
      { error: "Nao foi possivel criar jobs." },
      { status: 500 }
    );
  }

  after(async () => {
    await processBulkImportJobs({
      userId: user.id,
      storeId,
      limit: Math.min(insertedJobs.length, 5),
    });
  });

  return NextResponse.json({
    jobs: insertedJobs.map((job) => job.id),
    queued: insertedJobs.length,
  });
}
