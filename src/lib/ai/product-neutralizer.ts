import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

interface ProductImageInput {
  url: string;
  altText?: string | null;
}

interface ProductNeutralizeInput {
  userId: string;
  title: string;
  descriptionHtml?: string;
  tags?: string[];
  seo?: { title?: string; description?: string };
  images?: ProductImageInput[];
  maxImages?: number;
  targetLanguage?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storageClient: any;
}

export interface ProductNeutralizeResult {
  title: string;
  descriptionHtml: string;
  tags: string[];
  seo: { title: string; description: string };
  images: { src: string; altText: string }[];
  warnings: string[];
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const KNOWN_BRANDS = [
  "adidas",
  "apple",
  "balenciaga",
  "calvin klein",
  "chanel",
  "dior",
  "gucci",
  "lacoste",
  "louis vuitton",
  "lv",
  "nike",
  "off-white",
  "polo",
  "prada",
  "puma",
  "supreme",
  "tommy hilfiger",
  "versace",
  "zara",
];

function ensureGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao esta configurada para neutralizar produtos.");
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

function stripKnownBrands(value: string) {
  let output = value || "";
  for (const brand of KNOWN_BRANDS) {
    output = output.replace(new RegExp(`\\b${brand}\\b`, "gi"), "");
  }
  return output.replace(/\s{2,}/g, " ").replace(/\s+[-|,]\s*$/g, "").trim();
}

async function toJpegBase64(buffer: Buffer, maxSize = 1200) {
  const optimized = await sharp(buffer)
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return optimized.toString("base64");
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
    // O upload abaixo vai retornar erro se o bucket realmente nao existir.
  }
}

async function neutralizeText(input: ProductNeutralizeInput) {
  const language = input.targetLanguage || "pt-BR";
  const prompt = `Voce e um especialista em catalogo de e-commerce.

Transforme este produto em uma versao neutra, sem marca registrada, sem logo e sem qualquer identificador de marca.

Produto original:
Titulo: ${input.title}
Descricao HTML: ${input.descriptionHtml || ""}
Tags: ${(input.tags || []).join(", ")}
SEO: ${JSON.stringify(input.seo || {})}
Idioma final obrigatório: ${language}

Regras obrigatorias:
- Remova nomes como Nike, Adidas, Apple, Gucci, Louis Vuitton e qualquer marca reconhecivel.
- Se o titulo for "camisa nike", retorne algo como "camisa" ou "camiseta esportiva", preservando o tipo do produto.
- Nao invente uma nova marca.
- Preserve material, cor, publico, uso e detalhes comerciais quando forem seguros.
- Tudo no idioma final obrigatório "${language}".
- Titulo com no maximo 70 caracteres.
- Descricao em HTML limpo, objetiva e vendavel.
- Tags genericas, sem marcas.

Responda apenas JSON valido:
{
  "title": "...",
  "descriptionHtml": "<p>...</p>",
  "tags": ["..."],
  "seo": { "title": "...", "description": "..." }
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const parsed = parseJsonObject<{
    title?: string;
    descriptionHtml?: string;
    tags?: string[];
    seo?: { title?: string; description?: string };
  }>(response.text || "");

  const title = stripKnownBrands(parsed.title || input.title) || "Produto";
  const descriptionHtml =
    parsed.descriptionHtml || `<p>${title}</p>`;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map(stripKnownBrands).filter(Boolean).slice(0, 10)
    : [];

  return {
    title,
    descriptionHtml: stripKnownBrands(descriptionHtml),
    tags,
    seo: {
      title: stripKnownBrands(parsed.seo?.title || title).slice(0, 70),
      description: stripKnownBrands(parsed.seo?.description || title).slice(0, 155),
    },
  };
}

async function neutralizeImage(
  image: ProductImageInput,
  title: string,
  input: ProductNeutralizeInput,
  index: number
) {
  const imageResponse = await fetch(image.url, {
    signal: AbortSignal.timeout(20000),
  });
  if (!imageResponse.ok) {
    throw new Error("Nao foi possivel baixar a imagem original.");
  }

  const originalBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const originalBase64 = await toJpegBase64(originalBuffer);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Neutralize this e-commerce product image.

Product: "${title}"
Target language for any internal reasoning: "${input.targetLanguage || "pt-BR"}"

Requirements:
- Remove every visible brand logo, trademark, badge, wordmark, monogram, watermark, store name, and identifying text.
- If a logo is printed on the product, erase it and rebuild the fabric/material naturally.
- Keep the same product type, color, angle, shape, material, and main commercial details.
- Do not add any new brand, text, symbol, watermark, or label.
- Use a clean marketplace-ready product photo style.
- Keep the result realistic and ready for Shopify product media.`,
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: originalBase64,
            },
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
    throw new Error("A IA nao retornou imagem neutralizada.");
  }

  const generatedBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  const finalBuffer = await sharp(generatedBuffer).png().toBuffer();
  const fileName = `${input.userId}/${Date.now()}-${index}-${Math.random()
    .toString(36)
    .slice(2, 8)}-neutral.png`;

  const { error } = await input.storageClient.storage
    .from("product-images")
    .upload(fileName, finalBuffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (error) throw new Error("Erro ao salvar imagem neutralizada.");

  const { data } = input.storageClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  return {
    src: data.publicUrl,
    altText: title,
  };
}

export async function neutralizeProductForDestination(
  input: ProductNeutralizeInput
): Promise<ProductNeutralizeResult> {
  ensureGeminiKey();
  await ensureProductImagesBucket();

  const text = await neutralizeText(input);
  const warnings: string[] = [];
  const images: { src: string; altText: string }[] = [];
  const sourceImages = (input.images || []).slice(0, input.maxImages || 3);

  for (const [index, image] of sourceImages.entries()) {
    try {
      images.push(await neutralizeImage(image, text.title, input, index));
    } catch (error) {
      warnings.push(
        `${image.url}: ${
          error instanceof Error ? error.message : "Falha ao neutralizar imagem."
        }`
      );
    }
  }

  return {
    ...text,
    images,
    warnings,
  };
}
