import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { imageUrl, storeId } = await request.json();

    if (!imageUrl || !storeId) {
      return NextResponse.json(
        { error: "imageUrl e storeId obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar logo_path da loja
    const { data: store } = await supabase
      .from("stores")
      .select("logo_path")
      .eq("id", storeId)
      .eq("user_id", user.id)
      .single();

    if (!store?.logo_path) {
      return NextResponse.json(
        { error: "Logo não configurada. Configure o perfil da loja primeiro." },
        { status: 400 }
      );
    }

    // Baixar logo do Supabase Storage
    const { data: logoData, error: logoError } = await supabase.storage
      .from("store-logos")
      .download(store.logo_path);

    if (logoError || !logoData) {
      return NextResponse.json(
        { error: "Erro ao carregar logo da loja" },
        { status: 500 }
      );
    }

    const logoBuffer = Buffer.from(await logoData.arrayBuffer());

    // Baixar imagem do produto
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) {
      return NextResponse.json(
        { error: "Erro ao baixar imagem do produto" },
        { status: 400 }
      );
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Obter dimensões da imagem
    const metadata = await sharp(imgBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 800;

    // Redimensionar logo para ~20% da largura da imagem
    const logoWidth = Math.round(width * 0.2);
    const resizedLogo = await sharp(logoBuffer)
      .resize(logoWidth)
      .png()
      .toBuffer();

    // Obter dimensões da logo redimensionada
    const logoMeta = await sharp(resizedLogo).metadata();
    const logoH = logoMeta.height || 40;

    // Compor: imagem + logo no canto inferior direito
    const padding = Math.round(width * 0.03);
    const result = await sharp(imgBuffer)
      .resize(width, height, { fit: "cover" })
      .composite([
        {
          input: resizedLogo,
          top: height - logoH - padding,
          left: width - logoWidth - padding,
        },
      ])
      .png()
      .toBuffer();

    // Upload para Supabase Storage (URL permanente para Shopify)
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-branded.png`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, result, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("[image/branded] Upload error:", uploadError);
      return NextResponse.json(
        { error: "Erro ao salvar imagem" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar imagem";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
