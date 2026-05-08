import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface PostProduct {
  title?: string;
  handle?: string;
  price?: string | null;
  tags?: string[];
  description?: string | null;
}

function ensureGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao esta configurada.");
  }
}

function parseJsonObject<T>(text: string): T {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("A IA nao retornou JSON valido.");
    return JSON.parse(match[0]) as T;
  }
}

function stripHtml(value?: string | null) {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
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
    const products: PostProduct[] = Array.isArray(body.products)
      ? body.products.slice(0, 10)
      : [];
    const tone =
      typeof body.tone === "string" ? body.tone : "natural, premium e vendedor";

    if (!storeId || products.length === 0) {
      return NextResponse.json(
        { error: "Selecione uma loja e pelo menos um produto." },
        { status: 400 }
      );
    }

    const { data: store, error } = await supabase
      .from("stores")
      .select(
        "id, name, niche, target_audience, brand_voice, store_description, target_language"
      )
      .eq("id", storeId)
      .eq("user_id", user.id)
      .single();

    if (error || !store) {
      return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
    }

    const language = store.target_language || "pt-BR";
    const productLines = products
      .map((product, index) => {
        const tags = product.tags?.slice(0, 8).join(", ") || "";
        return `${index + 1}. ${product.title || "Produto"}
Preco: ${product.price || "nao informado"}
Handle: ${product.handle || ""}
Tags: ${tags}
Descricao curta: ${stripHtml(product.description)}`;
      })
      .join("\n\n");

    const prompt = `Voce prepara posts de Instagram para e-commerce.

Loja: ${store.name}
Nicho: ${store.niche || "geral"}
Publico: ${store.target_audience || "geral"}
Voz da marca: ${store.brand_voice || "natural e confiavel"}
Descricao da loja: ${store.store_description || ""}
Idioma final obrigatorio: ${language}
Tom pedido: ${tone}

Produtos selecionados para carrossel:
${productLines}

Crie um post pronto para publicar em carrossel. Nao invente descontos, estoque, prazo ou beneficios que nao aparecem nos dados. Nao use claims medicos/financeiros. Pode sugerir CTA leve.

Responda APENAS JSON valido:
{
  "caption": "legenda pronta, natural, com quebras de linha quando fizer sentido",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "slidePlan": ["ideia curta para slide 1", "ideia curta para slide 2"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.75 },
    });

    const parsed = parseJsonObject<{
      caption?: string;
      hashtags?: string[];
      slidePlan?: string[];
    }>(response.text || "");
    const hashtags = (parsed.hashtags || [])
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 18);
    const captionParts = [parsed.caption || "", hashtags.join(" ")]
      .map((part) => part.trim())
      .filter(Boolean);

    return NextResponse.json({
      caption: captionParts.join("\n\n").slice(0, 2200),
      hashtags,
      slidePlan: (parsed.slidePlan || []).slice(0, 10),
    });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Falha ao preparar post com IA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
