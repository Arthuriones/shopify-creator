import { NextRequest, NextResponse } from "next/server";
import {
  buildCartPermalink,
  resolveCheckoutLinesDetailed,
  type CheckoutRouteLine,
} from "@/lib/shopify/cart-routing";
import { resolveVariantIdsBySku } from "@/lib/shopify/public-store";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const lines = Array.isArray(body.lines)
    ? (body.lines as CheckoutRouteLine[])
    : [];

  if (!token || lines.length === 0) {
    return NextResponse.json(
      { error: "token e lines sao obrigatorios." },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const supabase = createAdminClient();
    const { data: config, error } = await supabase
      .from("routed_checkout_configs")
      .select(
        "id, name, enabled, mode, sku_map, variant_map, settings, target:target_store_id(shop_domain)"
      )
      .eq("public_token", token)
      .eq("enabled", true)
      .single();

    if (error || !config) {
      return NextResponse.json(
        { error: "Checkout roteado nao encontrado." },
        { status: 404, headers: corsHeaders }
      );
    }

    const target = Array.isArray(config.target)
      ? config.target[0]
      : config.target;
    const targetDomain = target?.shop_domain;

    const detailed = resolveCheckoutLinesDetailed(lines, {
      skuMap: (config.sku_map || {}) as Record<string, string | number>,
      variantMap: (config.variant_map || {}) as Record<string, string | number>,
    });

    // Fallback: linhas que o mapa nao cobriu mas tem SKU sao resolvidas por SKU
    // direto no products.json publico da dark store. Conserta variantes nao
    // mapeadas e permite rota so com o dominio (sem conectar a loja).
    const unresolvedSkus = detailed
      .filter((line) => !line.variantId && line.sku)
      .map((line) => line.sku);
    if (unresolvedSkus.length > 0 && targetDomain) {
      const bySku = await resolveVariantIdsBySku(targetDomain, unresolvedSkus);
      if (bySku.size > 0) {
        for (const line of detailed) {
          if (!line.variantId && line.sku) {
            const variantId = bySku.get(line.sku);
            if (variantId) line.variantId = String(variantId);
          }
        }
      }
    }

    const resolvedLines = detailed
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId as string,
        quantity: line.quantity,
      }));
    const unroutedCount = detailed.length - resolvedLines.length;

    const redirectUrl = buildCartPermalink(targetDomain, resolvedLines, {
      routed_checkout: config.id,
      routed_mode: config.mode,
    });

    return NextResponse.json(
      {
        redirectUrl,
        mode: config.mode,
        routedLines: resolvedLines.length,
        unroutedLines: unroutedCount,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao resolver checkout.";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
