import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const maxDuration = 60;

async function shopifyRest(
  domain: string,
  accessToken: string,
  path: string,
  options: RequestInit = {}
) {
  const res = await fetch(`https://${domain}/admin/api/2024-10${path}`, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify REST ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function getAccessToken(store: {
  shop_domain: string;
  client_id: string;
  client_secret: string;
  access_token?: string | null;
}): Promise<string> {
  // Always use client_credentials to get a fresh token with current scopes
  const res = await fetch(
    `https://${store.shop_domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: store.client_id,
        client_secret: store.client_secret,
      }),
    }
  );
  if (!res.ok) throw new Error("Falha ao obter token de acesso da vitrine.");
  const data = await res.json();
  return data.access_token;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Load route config
  const { data: config, error: configError } = await admin
    .from("routed_checkout_configs")
    .select(
      "id, public_token, sku_map, variant_map, settings, source_store_id, target:target_store_id(shop_domain, target_language)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
  }

  // Load vitrine (source) store credentials
  const { data: sourceStore, error: storeError } = await admin
    .from("stores")
    .select("shop_domain, client_id, client_secret, access_token")
    .eq("id", config.source_store_id)
    .single();

  if (storeError || !sourceStore) {
    return NextResponse.json({ error: "Vitrine não encontrada." }, { status: 404 });
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

  const rawSkuMap = (config.sku_map || {}) as Record<string, string | number>;
  const skuMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawSkuMap)) {
    const key = k.trim().toLowerCase();
    if (key) skuMap[key] = String(v);
  }

  const rawVariantMap = (config.variant_map || {}) as Record<string, string | number>;
  const variantMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVariantMap)) {
    if (k) variantMap[k] = String(v);
  }

  const inlineConfig = { domain, skuMap, variantMap, country, locale };
  const appOrigin = getPublicAppUrl(
    process.env.NEXT_PUBLIC_APP_URL || "https://xcart.app"
  );

  const newScriptTag =
    `<script\n  src="${appOrigin}/routed-checkout-loader.js"\n  data-token="${config.public_token}"\n  data-config='${JSON.stringify(inlineConfig)}'\n  async>\n</script>`;

  try {
    const accessToken = await getAccessToken(sourceStore);
    const vitrineDomain = sourceStore.shop_domain;

    // Find active theme
    const themesData = await shopifyRest(vitrineDomain, accessToken, "/themes.json");
    const themes = (themesData.themes || []) as { id: number; role: string }[];
    const mainTheme = themes.find((t) => t.role === "main");
    if (!mainTheme) {
      return NextResponse.json({ error: "Tema ativo não encontrado na vitrine." }, { status: 404 });
    }

    // Get theme.liquid
    const assetData = await shopifyRest(
      vitrineDomain,
      accessToken,
      `/themes/${mainTheme.id}/assets.json?asset[key]=layout/theme.liquid`
    );
    const currentContent: string = assetData.asset?.value || "";

    if (!currentContent) {
      return NextResponse.json({ error: "theme.liquid não encontrado ou vazio." }, { status: 404 });
    }

    // Replace existing xcart script tag (identified by data-token)
    const scriptRegex = /<script\b[^>]*data-token=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/g;
    const hasExisting = scriptRegex.test(currentContent);

    let newContent: string;
    if (hasExisting) {
      newContent = currentContent.replace(
        /<script\b[^>]*data-token=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/g,
        newScriptTag
      );
    } else {
      // Insert before </head> if no existing script found
      newContent = currentContent.replace("</head>", `${newScriptTag}\n</head>`);
    }

    if (newContent === currentContent) {
      return NextResponse.json({
        ok: true,
        updated: false,
        message: "Conteúdo já estava atualizado — nenhuma alteração feita.",
      });
    }

    // Write back
    await shopifyRest(vitrineDomain, accessToken, `/themes/${mainTheme.id}/assets.json`, {
      method: "PUT",
      body: JSON.stringify({
        asset: { key: "layout/theme.liquid", value: newContent },
      }),
    });

    return NextResponse.json({
      ok: true,
      updated: true,
      message: hasExisting
        ? "Script atualizado no tema da vitrine com sucesso."
        : "Script inserido no tema da vitrine com sucesso.",
      skuCount: Object.keys(skuMap).length,
      variantCount: Object.keys(variantMap).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar tema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
