import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, rawDescription, storeId } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Optional: Get store context to tailor the description
    let storeContext = "";
    if (storeId) {
      const { data: store } = await supabase
        .from("stores")
        .select("niche, target_audience, brand_voice")
        .eq("id", storeId)
        .single();
      
      if (store) {
        storeContext = `
A loja atua no nicho de: ${store?.niche || "Geral"}.
Público-alvo: ${store?.target_audience || "Geral"}.
Tom de voz da marca: ${store?.brand_voice || "Elegante e persuasivo"}.
`;
      }
    }

    const prompt = `
Você é um copywriter especialista em e-commerce focado em alta conversão e branding premium.
Sua tarefa é escrever uma descrição de produto otimizada baseada no título e nas informações brutas do fornecedor (AliExpress).
${storeContext}

Título do Produto: ${title}
Informações/Especificações originais:
${rawDescription || "Não fornecido. Baseie-se apenas no título para deduzir as melhores características."}

ESTRUTURA OBRIGATÓRIA DA DESCRIÇÃO:
Crie uma descrição no seguinte formato (retorne APENAS o HTML da descrição, sem tags html de bloco externas como \`\`\`html, use apenas as tags <p>, <ul>, <li> e <strong>):

<p>A [Nome do Produto] é uma joia/produto [Adjetivo], perfeita para quem busca [Benefício 1] com [Benefício 2] e visual [Adjetivo]. Seu design com [Detalhe visual] traz um toque [Adjetivo], ideal para compor [Situação de uso].</p>

<p>Produzida em [Material, ex: prata 925 / couro / etc], a peça conta com acabamento [Adjetivo] e [Detalhe técnico, ex: aplicação de zircônias], que proporcionam [Benefício visual] na medida certa. É um produto versátil, pensado para valorizar o visual em diferentes ocasiões, desde o uso diário até momentos especiais.</p>

<p>Com estilo [Adjetivo], essa [peça/produto] também é uma ótima opção para presente, especialmente em [Ocasião de presente] ou para surpreender alguém com [Adjetivo].</p>

<p><strong>Características do produto:</strong></p>
<ul>
  <li><strong>Material:</strong> [Material deduzido das especificações]</li>
  <li><strong>Estilo:</strong> [Estilo]</li>
  <li><strong>Tipo:</strong> [Tipo]</li>
  <li><strong>Ocasião:</strong> [Ocasião]</li>
  <li>[Outras características relevantes, como peso, tamanho, pedra, etc. Crie quantos <li> forem necessários baseando-se nas informações.]</li>
</ul>

INSTRUÇÕES:
- Adapte os adjetivos e o texto para se encaixar com o nicho e tom de voz da loja.
- Substitua todos os colchetes pelo conteúdo adequado e criativo baseado no produto real.
- O texto DEVE ter exatamente 3 parágrafos narrativos elegantes e depois a lista de características.
- NÃO inclua informações de envio chinês (ePacket, prazo longo), apenas fale do produto em si.
- Retorne apenas o código HTML formatado.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    let descriptionHtml = response.text || "";
    // Remove markdown code blocks if any
    descriptionHtml = descriptionHtml.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();

    return NextResponse.json({ descriptionHtml });
  } catch (error) {
    console.error("Generate description error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar descrição com IA" },
      { status: 500 }
    );
  }
}
