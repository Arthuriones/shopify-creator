import { NextRequest, NextResponse } from "next/server";
import { createInstagramCarousel } from "@/lib/instagram/meta";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls
        .map((url: unknown) => String(url).trim())
        .filter((url: string) => /^https:\/\//i.test(url))
    : [];
  const caption =
    typeof body.caption === "string"
      ? body.caption
      : "Produtos selecionados da loja.";
  const productIds = Array.isArray(body.productIds)
    ? body.productIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (imageUrls.length < 2) {
    return NextResponse.json(
      { error: "Selecione pelo menos 2 imagens/produtos para criar carrossel." },
      { status: 400 }
    );
  }

  const { data: connection, error } = await supabase
    .from("instagram_connections")
    .select(
      "id, instagram_business_account_id, access_token, page_access_token, instagram_username"
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !connection) {
    return NextResponse.json(
      { error: "Conecte uma conta Instagram profissional antes de publicar." },
      { status: 400 }
    );
  }

  try {
    const result = await createInstagramCarousel({
      instagramUserId: connection.instagram_business_account_id,
      accessToken: connection.page_access_token || connection.access_token,
      imageUrls,
      caption,
    });

    await supabase.from("instagram_posts").insert({
      user_id: user.id,
      connection_id: connection.id,
      caption,
      image_urls: imageUrls.slice(0, 10),
      product_ids: productIds,
      status: "published",
      result,
      published_media_id: result.publishedMediaId,
    });

    return NextResponse.json({ result });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Falha ao publicar carrossel.";
    await supabase.from("instagram_posts").insert({
      user_id: user.id,
      connection_id: connection.id,
      caption,
      image_urls: imageUrls.slice(0, 10),
      product_ids: productIds,
      status: "failed",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
