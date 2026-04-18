import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { imageUrl, productTitle, storeId } = await request.json();

    if (!imageUrl || !productTitle) {
      return NextResponse.json(
        { error: "imageUrl e productTitle obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar logo da loja (opcional)
    let logoBuffer: Buffer | null = null;
    if (storeId) {
      const { data: store } = await supabase
        .from("stores")
        .select("logo_path")
        .eq("id", storeId)
        .eq("user_id", user.id)
        .single();

      if (store?.logo_path) {
        const { data: logoData } = await supabase.storage
          .from("store-logos")
          .download(store.logo_path);
        if (logoData) {
          logoBuffer = Buffer.from(await logoData.arrayBuffer());
        }
      }
    }

    // Baixar imagem original do AliExpress
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Erro ao baixar imagem original" }, { status: 400 });
    }
    const originalBuffer = Buffer.from(await imgRes.arrayBuffer());
    const originalBase64 = originalBuffer.toString("base64");

    // Gerar imagem limpa com Gemini (visão + geração)
    const prompt = `You are a professional e-commerce product photographer.

Look at this product image and recreate it as a clean, professional product photo.

Product: "${productTitle}"

REQUIREMENTS:
- Remove ALL logos, watermarks, text overlays, and branding from AliExpress or any other marketplace
- Remove any Chinese text or characters
- Keep the EXACT same product, angle, and composition
- Use a clean white or light gradient background
- Professional studio lighting
- High quality, sharp details
- E-commerce ready (square aspect ratio)
- DO NOT add any text, logos, or watermarks to the new image
- Make it look like a premium brand product photo

Generate the clean product image.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: originalBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // Extrair imagem gerada da resposta
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      return NextResponse.json(
        { error: "IA não retornou imagem. Tente novamente." },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagePart = candidate.content.parts.find(
      (p: any) => p.inlineData
    );
    if (!imagePart?.inlineData?.data) {
      return NextResponse.json(
        { error: "IA não gerou imagem. Tente novamente." },
        { status: 500 }
      );
    }

    const generatedBuffer = Buffer.from(imagePart.inlineData.data as string, "base64");

    // Aplicar logo da loja se disponível
    let finalBuffer: Buffer;
    if (logoBuffer) {
      const metadata = await sharp(generatedBuffer).metadata();
      const width = metadata.width || 800;
      const height = metadata.height || 800;

      const logoWidth = Math.round(width * 0.18);
      const resizedLogo = await sharp(logoBuffer).resize(logoWidth).png().toBuffer();
      const logoMeta = await sharp(resizedLogo).metadata();
      const logoH = logoMeta.height || 40;
      const padding = Math.round(width * 0.03);

      finalBuffer = await sharp(generatedBuffer)
        .composite([
          {
            input: resizedLogo,
            top: height - logoH - padding,
            left: width - logoWidth - padding,
          },
        ])
        .png()
        .toBuffer();
    } else {
      finalBuffer = generatedBuffer;
    }

    // Upload para Supabase Storage (URL permanente para Shopify)
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, finalBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("[image/generate] Upload error:", uploadError);
      return NextResponse.json(
        { error: "Erro ao salvar imagem gerada" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("[image/generate] Error:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar imagem";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
