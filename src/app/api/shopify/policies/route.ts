import { NextRequest, NextResponse } from "next/server";
import { updateStorePolicies } from "@/lib/shopify/client";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeId, policies } = await request.json();

  if (!storeId || !policies?.length) {
    return NextResponse.json(
      { error: "storeId and policies are required" },
      { status: 400 }
    );
  }

  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, client_id, client_secret, access_token")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    const result = await updateStorePolicies(
      {
        shopDomain: store.shop_domain,
        clientId: store.client_id,
        clientSecret: store.client_secret,
        accessToken: store.access_token,
      },
      policies
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Policy update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
