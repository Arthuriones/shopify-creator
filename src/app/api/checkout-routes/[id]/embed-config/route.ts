import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: config, error } = await admin
    .from("routed_checkout_configs")
    .select(
      "id, sku_map, variant_map, settings, target:target_store_id(shop_domain, target_language)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !config) {
    return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
  }

  const target = Array.isArray(config.target) ? config.target[0] : config.target;
  const settings = (config.settings || {}) as {
    checkout_domain?: string;
    checkout_country?: string;
    checkout_locale?: string;
  };

  const domain = settings.checkout_domain?.trim() || target?.shop_domain || "";

  let country = settings.checkout_country || "";
  let locale = settings.checkout_locale || "";
  if (!country && target?.target_language) {
    const [, region] = String(target.target_language).split("-");
    country = region ? region.toUpperCase() : "";
    locale = target.target_language;
  }

  // Normalize sku_map: keys lowercase, values as strings
  const rawSkuMap = (config.sku_map || {}) as Record<string, string | number>;
  const skuMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawSkuMap)) {
    const key = k.trim().toLowerCase();
    if (key) skuMap[key] = String(v);
  }

  // Normalize variant_map: values as strings
  const rawVariantMap = (config.variant_map || {}) as Record<string, string | number>;
  const variantMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVariantMap)) {
    if (k) variantMap[k] = String(v);
  }

  return NextResponse.json({
    domain,
    skuMap,
    variantMap,
    country,
    locale,
  });
}
