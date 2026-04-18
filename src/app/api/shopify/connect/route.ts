import { NextRequest, NextResponse } from "next/server";
import { getShopInfo, getThemes } from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shopDomain, clientId, clientSecret } = await request.json();

  if (!shopDomain || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: "shopDomain, clientId and clientSecret are required" },
      { status: 400 }
    );
  }

  const creds = { shopDomain, clientId, clientSecret };

  try {
    const [shopData, themesData] = await Promise.all([
      getShopInfo(creds),
      getThemes(creds),
    ]);

    const activeTheme = themesData.themes.nodes.find(
      (t: { role: string }) => t.role === "MAIN"
    );

    const { data: store, error } = await supabase
      .from("stores")
      .upsert(
        {
          user_id: user.id,
          shop_domain: shopDomain,
          client_id: clientId,
          client_secret: clientSecret,
          name: shopData.shop.name,
          theme_id: activeTheme?.id || null,
        },
        { onConflict: "user_id,shop_domain" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to save store" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      store,
      shop: shopData.shop,
      theme: activeTheme,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
