import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface GeneratedReview {
  customerName: string;
  rating: number;
  title: string;
  body: string;
  productUseCase: string;
  disclosure: string;
  imagePrompt?: string;
  imageUrl?: string;
}

function normalizeProductNumericId(value: string) {
  const match = value.match(/Product\/(\d+)$/) || value.match(/^(\d+)$/);
  return match?.[1] || "";
}

function ensureGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao esta configurada.");
  }
}

function parseJsonArray<T>(text: string): T[] {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T[];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("A IA nao retornou JSON valido.");
    return JSON.parse(match[0]) as T[];
  }
}

async function ensureProductImagesBucket() {
  try {
    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();
    const existing = new Set((buckets || []).map((bucket) => bucket.name));
    if (!existing.has("product-images")) {
      await admin.storage.createBucket("product-images", { public: true });
    }
  } catch {
    // O upload retornara erro se o bucket realmente nao existir.
  }
}

async function getStoreProfile(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select(
      "id, name, niche, target_audience, brand_voice, store_description, target_language"
    )
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  if (!error && data) return data;

  const { data: fallback } = await supabase
    .from("stores")
    .select("id, name, niche, target_audience, brand_voice, store_description")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  return fallback ? { ...fallback, target_language: "pt-BR" } : null;
}

async function generateReviewTexts(input: {
  productTitle: string;
  productDescription: string;
  count: number;
  tone: string;
  imageStyle: string;
  store: {
    name: string;
    niche?: string | null;
    target_audience?: string | null;
    brand_voice?: string | null;
    store_description?: string | null;
    target_language?: string | null;
  };
}) {
  const language = input.store.target_language || "pt-BR";
  const prompt = `Voce e um gerador de conteudo UGC sintetico para e-commerce.

IMPORTANTE:
- Gere reviews simulados para mockups, criativos e layout.
- Nao afirme que sao avaliacoes reais de clientes.
- Cada item deve conter disclosure claro dizendo que e conteudo gerado por IA / simulacao.
- Nao use nomes de pessoas reais famosas.
- Nao use promessas medicas, financeiras ou resultados garantidos.

Loja: ${input.store.name}
Nicho: ${input.store.niche || "geral"}
Publico: ${input.store.target_audience || "geral"}
Voz da marca: ${input.store.brand_voice || "natural e confiavel"}
Descricao da loja: ${input.store.store_description || ""}
Idioma final obrigatório: ${language}

Produto:
Titulo: ${input.productTitle}
Descricao: ${input.productDescription || "Sem descricao adicional"}

Quantidade: ${input.count}
Tom: ${input.tone}
Estilo das fotos: ${input.imageStyle}

Responda APENAS um JSON array valido. Cada item:
{
  "customerName": "nome ficticio curto",
  "rating": 4 ou 5,
  "title": "titulo curto do review",
  "body": "texto de review simulado, natural, 1-3 frases",
  "productUseCase": "contexto de uso",
  "disclosure": "Conteudo gerado por IA / simulacao",
  "imagePrompt": "prompt em ingles para gerar uma foto UGC sintetica do produto, sem rostos identificaveis, sem marcas falsas, sem texto, sem logos"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.8 },
  });

  return parseJsonArray<GeneratedReview>(response.text || "").slice(0, input.count);
}

async function generateReviewImage(input: {
  prompt: string;
  userId: string;
  index: number;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${input.prompt}

Create a synthetic AI-generated UGC-style product photo.
Rules:
- No identifiable real person.
- Prefer hands, tabletop, unboxing, mirrorless lifestyle crop, or product-in-use detail.
- No text, no watermarks, no brand logos unless they are part of the provided product title and should still be avoided.
- Realistic ecommerce social proof mockup image.
- Square image, clean lighting.`,
          },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (part) => "inlineData" in part && part.inlineData?.data
  ) as { inlineData?: { data?: string } } | undefined;

  if (!imagePart?.inlineData?.data) {
    throw new Error("A IA nao retornou imagem.");
  }

  const generatedBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  const finalBuffer = await sharp(generatedBuffer)
    .resize({ width: 1200, height: 1200, fit: "cover" })
    .png()
    .toBuffer();

  const fileName = `${input.userId}/reviews/${Date.now()}-${input.index}-${Math.random()
    .toString(36)
    .slice(2, 8)}.png`;

  const { error } = await input.supabase.storage
    .from("product-images")
    .upload(fileName, finalBuffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (error) throw new Error("Erro ao salvar imagem do review.");

  const { data } = input.supabase.storage
    .from("product-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export async function POST(request: NextRequest) {
  try {
    ensureGeminiKey();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    const productTitle =
      typeof body.productTitle === "string" ? body.productTitle.trim() : "";
    const productDescription =
      typeof body.productDescription === "string"
        ? body.productDescription.trim()
        : "";
    const productId =
      typeof body.productId === "string" ? body.productId.trim() : "";
    const productHandle =
      typeof body.productHandle === "string" ? body.productHandle.trim() : "";
    const count = Math.min(Math.max(Number(body.count || 4), 1), 8);
    const tone = typeof body.tone === "string" ? body.tone : "natural";
    const imageStyle =
      typeof body.imageStyle === "string" ? body.imageStyle : "unboxing";
    const includeImages = body.includeImages !== false;
    const publishToWidget = body.publishToWidget !== false && productId !== "manual";

    if (!storeId || !productTitle) {
      return NextResponse.json(
        { error: "storeId e productTitle sao obrigatorios." },
        { status: 400 }
      );
    }

    const store = await getStoreProfile(storeId, user.id);
    if (!store) {
      return NextResponse.json(
        { error: "Loja nao encontrada." },
        { status: 404 }
      );
    }

    await ensureProductImagesBucket();

    const reviews = await generateReviewTexts({
      productTitle,
      productDescription,
      count,
      tone,
      imageStyle,
      store,
    });

    if (includeImages) {
      for (const [index, review] of reviews.entries()) {
        try {
          review.imageUrl = await generateReviewImage({
            prompt: review.imagePrompt || `${imageStyle} photo of ${productTitle}`,
            userId: user.id,
            index,
            supabase,
          });
        } catch (error) {
          review.imageUrl = undefined;
          review.imagePrompt = `${review.imagePrompt || ""}\nImagem nao gerada: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`;
        }
      }
    }

    let savedCount = 0;
    if (publishToWidget && productId) {
      const admin = createAdminClient();
      const disclosure =
        store.target_language === "en-US"
          ? "AI-generated synthetic review content. Do not publish as real customer reviews without disclosure."
          : "Conteudo sintetico gerado por IA. Nao publique como avaliacao real de cliente sem disclosure.";
      const { error } = await admin.from("ai_product_reviews").insert(
        reviews.map((review) => ({
          user_id: user.id,
          store_id: storeId,
          product_id: productId,
          product_numeric_id: normalizeProductNumericId(productId),
          product_handle: productHandle || null,
          product_title: productTitle,
          customer_name: review.customerName,
          rating: review.rating,
          title: review.title,
          body: review.body,
          product_use_case: review.productUseCase,
          disclosure: review.disclosure || disclosure,
          image_url: review.imageUrl || null,
          image_prompt: review.imagePrompt || null,
          published: true,
        }))
      );

      if (error) {
        throw new Error(`Reviews gerados, mas nao foi possivel salvar para o widget: ${error.message}`);
      }
      savedCount = reviews.length;
    }

    return NextResponse.json({
      reviews,
      savedCount,
      disclosure:
        store.target_language === "en-US"
          ? "AI-generated synthetic review content. Do not publish as real customer reviews without disclosure."
          : "Conteudo sintetico gerado por IA. Nao publique como avaliacao real de cliente sem disclosure.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao gerar reviews.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
