import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_BUCKETS = [
  { id: "store-assets", isPublic: true },
  { id: "store-logos", isPublic: true },
  { id: "product-images", isPublic: true },
];

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: buckets, error: listError } = await admin.storage.listBuckets();

    if (listError) {
      return NextResponse.json(
        { error: "Nao foi possivel verificar buckets do storage." },
        { status: 500 }
      );
    }

    const existing = new Set((buckets || []).map((bucket) => bucket.name));
    const created: string[] = [];
    const ensured: string[] = [];

    for (const bucket of REQUIRED_BUCKETS) {
      ensured.push(bucket.id);
      if (existing.has(bucket.id)) continue;

      const { error } = await admin.storage.createBucket(bucket.id, {
        public: bucket.isPublic,
      });

      if (error && !/already exists/i.test(error.message)) {
        return NextResponse.json(
          { error: `Falha ao criar bucket ${bucket.id}: ${error.message}` },
          { status: 500 }
        );
      }

      created.push(bucket.id);
    }

    return NextResponse.json({
      ok: true,
      ensured,
      created,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao preparar buckets de storage.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
