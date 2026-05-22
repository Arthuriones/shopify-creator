import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AliExpressProduct,
  OptimizationResult,
  StoreContext,
  StorePolicy,
  StoreSetup,
} from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

function targetLanguage(context?: StoreContext) {
  return context?.targetLanguage || "pt-BR";
}

export async function optimizeProduct(
  product: AliExpressProduct,
  context: StoreContext,
  customPrompt?: string
): Promise<OptimizationResult> {
  const language = targetLanguage(context);
  const normalizedCustomPrompt = customPrompt?.trim();
  const prompt = `Você é um copywriter especialista em e-commerce para lojas Shopify.

Sua tarefa: transformar este produto importado do AliExpress em um produto profissional para vender no Brasil.

Loja: "${context.name}"
Nicho: "${context.niche}"
Público-alvo: "${context.targetAudience || "Não especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "Não especificado"}"
Idioma final obrigatório: "${language}"

Produto original:
- Título: ${product.title}
- Descrição: ${product.description || "Sem descrição"}
- Preço: US$${product.price}
- Avaliação: ${product.rating || "N/A"} estrelas
- Pedidos: ${product.orders || "N/A"}
- Especificações: ${JSON.stringify(product.specs)}

REGRAS OBRIGATÓRIAS:
1. TUDO no idioma final obrigatório "${language}". Não misture idiomas.
2. Título: máximo 70 caracteres, com palavra-chave principal, sem chinês/caracteres estranhos, sem "AliExpress"
3. Descrição: HTML formatado e profissional com:
   - Headline chamativa com benefício principal
   - 3-5 bullet points com benefícios (usar emojis ✅ nos bullets)
   - Especificações técnicas em tabela HTML simples
   - Call-to-action final
   - NÃO mencionar China, AliExpress, importação, dropshipping
   - Tom: confiante, profissional, focado em benefícios
4. Tags: 5-8 tags em português, relevantes para SEO no Brasil
5. SEO Title: máximo 60 caracteres, em português
6. SEO Description: máximo 155 caracteres, em português, com call-to-action
${normalizedCustomPrompt ? `
INSTRUCOES PERSONALIZADAS DO USUARIO (PRIORIDADE ALTA):
${normalizedCustomPrompt}
- Siga estas instrucoes sempre que forem compativeis com as regras obrigatorias.
` : ""}

Responda APENAS em JSON válido neste formato:
{
  "title": "...",
  "description": "<html formatado>",
  "tags": ["tag1", "tag2"],
  "seoTitle": "...",
  "seoDescription": "..."
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseJsonResponse<OptimizationResult>(text);
}
export async function generateStorePolicies(
  context: StoreContext
): Promise<StorePolicy[]> {
  const language = targetLanguage(context);
  const prompt = `Gere polÃ­ticas profissionais e completas para a loja Shopify "${context.name}" no nicho "${context.niche}".

PÃºblico-alvo: "${context.targetAudience || "NÃ£o especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "NÃ£o especificado"}"
Idioma final obrigatÃ³rio: "${language}"

Gere 4 polÃ­ticas no idioma final obrigatÃ³rio:
1. PolÃ­tica de Reembolso
2. PolÃ­tica de Privacidade
3. Termos de ServiÃ§o
4. PolÃ­tica de Envio

Contexto da loja:
- Loja brasileira de e-commerce (Shopify)
- Prazo de entrega: 15 a 30 dias Ãºteis (envio internacional)
- Prazo de reembolso: 7 dias apÃ³s recebimento (CDC brasileiro)
- Prazo de troca: 7 dias apÃ³s recebimento
- Pagamentos: cartÃ£o de crÃ©dito (atÃ© 12x), PIX, boleto
- Rastreamento disponÃ­vel para todos os pedidos
- Deve seguir o CÃ³digo de Defesa do Consumidor (CDC)
- Deve mencionar LGPD na polÃ­tica de privacidade

Cada polÃ­tica deve:
- Ser profissional e transmitir confianÃ§a
- Estar formatada em HTML limpo
- Ser completa mas objetiva
- Usar linguagem acessÃ­vel
- Estar 100% no idioma final obrigatÃ³rio "${language}"

Responda APENAS em JSON vÃ¡lido:
[
  { "type": "refund", "title": "PolÃ­tica de Reembolso", "body": "<html>" },
  { "type": "privacy", "title": "PolÃ­tica de Privacidade", "body": "<html>" },
  { "type": "terms", "title": "Termos de ServiÃ§o", "body": "<html>" },
  { "type": "shipping", "title": "PolÃ­tica de Envio", "body": "<html>" }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseJsonResponse<StorePolicy[]>(text);
}

export async function suggestThemeImprovements(
  context: StoreContext,
  currentTheme: string
): Promise<string> {
  const language = targetLanguage(context);
  const prompt = `VocÃª Ã© um especialista em design e conversÃ£o de lojas Shopify brasileiras.

Loja: "${context.name}"
Nicho: "${context.niche}"
PÃºblico-alvo: "${context.targetAudience || "NÃ£o especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "NÃ£o especificado"}"
Tema atual: "${currentTheme}"
Idioma da resposta: "${language}"

Contexto: a loja usa um tema brasileiro otimizado com:
- BotÃ£o "Comprar Agora" verde (#16c789) direto pro checkout
- Countdown timer de ofertas
- Barra de escassez ("Restam X unidades")
- Calculadora de frete por CEP
- Badges de pagamento (Visa, Mastercard, PIX, etc)
- SeÃ§Ãµes de confianÃ§a (devoluÃ§Ã£o, envio nacional)
- Parcelamento em atÃ© 12x
- Frete grÃ¡tis acima de R$200
- Instagram feed integrado
- Fonte Montserrat

Sugira melhorias ESPECÃFICAS e PRÃTICAS para aumentar conversÃ£o. Inclua:
1. Melhorias na pÃ¡gina de produto (acima da dobra)
2. Melhorias na homepage (hero, produtos em destaque)
3. Elementos de prova social e confianÃ§a
4. OtimizaÃ§Ãµes mobile
5. Cores e tipografia que funcionam no nicho "${context.niche}"

Seja direto e prÃ¡tico. Cada sugestÃ£o deve ser acionÃ¡vel.
Responda no idioma "${language}", formatado em Markdown.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function generateStoreSetup(
  context: StoreContext
): Promise<StoreSetup> {
  const storeName = context.name;
  const niche = context.niche;
  const language = targetLanguage(context);
  const prompt = `VocÃª Ã© um especialista em configuraÃ§Ã£o de lojas Shopify brasileiras de dropshipping usando o tema Vessel.

Gere a configuraÃ§Ã£o COMPLETA da loja "${storeName}" no nicho "${niche}".

PÃºblico-alvo: "${context.targetAudience || "NÃ£o especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "NÃ£o especificado"}"
Idioma final obrigatÃ³rio para polÃ­ticas, pÃ¡ginas, menus, FAQ e copyright: "${language}"

CONTEXTO DO TEMA VESSEL:
- Header usa menu com handle "main-menu"
- Footer usa menu com handle "footer"
- Footer tem bloco de links de polÃ­ticas que renderiza automaticamente das polÃ­ticas do Shopify
- PolÃ­ticas sÃ£o publicadas via shopPolicyUpdate mutation (tipos: refund, privacy, terms, shipping)
- PÃ¡ginas adicionais (Sobre, Contato, FAQ) sÃ£o Shopify Pages
- BotÃ£o CTA verde (#16c789), countdown timer, barra de escassez, badges de pagamento
- Parcelamento 12x, frete grÃ¡tis acima de R$200

GERE:

1. **4 PolÃ­ticas** (refund, privacy, terms, shipping):
   - HTML limpo e profissional
   - Conformidade com CDC (CÃ³digo de Defesa do Consumidor)
   - LGPD na polÃ­tica de privacidade
   - Prazo de entrega: 15-30 dias Ãºteis
   - Reembolso: 7 dias apÃ³s recebimento
   - Pagamentos: cartÃ£o (atÃ© 12x), PIX, boleto
   - Rastreamento disponÃ­vel para todos os pedidos

2. **Menu principal** (handle: main-menu):
   - InÃ­cio (/)
   - CatÃ¡logo (/collections/all)
   - Sobre (/pages/sobre)
   - Contato (/pages/contato)
   - Rastreamento (/pages/rastreamento)

3. **Menu footer** (handle: footer):
   - PolÃ­tica de Privacidade (/policies/privacy-policy)
   - Termos de ServiÃ§o (/policies/terms-of-service)
   - PolÃ­tica de Reembolso (/policies/refund-policy)
   - PolÃ­tica de Envio (/policies/shipping-policy)
   - Contato (/pages/contato)

4. **PÃ¡ginas** (Shopify Pages):
   - **Sobre**: histÃ³ria profissional da marca no nicho "${niche}", tom confiante e aspiracional
   - **Contato**: formulÃ¡rio conceitual com email placeholder (contato@${storeName.toLowerCase().replace(/\s+/g, "")}.com.br) e menÃ§Ã£o a WhatsApp
   - **Rastreamento**: explica como rastrear pedidos passo a passo, menciona prazo de 15-30 dias Ãºteis, link para 17track.net
   - **FAQ**: perguntas frequentes sobre prazo de entrega, formas de pagamento, trocas/devoluÃ§Ãµes, como escolher tamanho, seguranÃ§a do site

5. **Copyright**: "2025 ${storeName} - Todos os Direitos Reservados"

REGRAS:
- TUDO no idioma final obrigatÃ³rio "${language}"
- Tom profissional, transmitir confianÃ§a
- HTML limpo sem CSS inline excessivo, usar tags semÃ¢nticas (h2, h3, p, ul, li)
- NÃƒO mencionar China, AliExpress, importaÃ§Ã£o, dropshipping
- PolÃ­ticas devem parecer de uma marca brasileira estabelecida
- FAQ deve abordar dÃºvidas reais de compradores online brasileiros

Responda APENAS em JSON vÃ¡lido:
{
  "policies": [
    { "type": "refund", "title": "PolÃ­tica de Reembolso", "body": "<html>" },
    { "type": "privacy", "title": "PolÃ­tica de Privacidade", "body": "<html>" },
    { "type": "terms", "title": "Termos de ServiÃ§o", "body": "<html>" },
    { "type": "shipping", "title": "PolÃ­tica de Envio", "body": "<html>" }
  ],
  "mainMenu": {
    "title": "Main menu",
    "handle": "main-menu",
    "items": [
      { "title": "InÃ­cio", "url": "/" },
      { "title": "CatÃ¡logo", "url": "/collections/all" },
      { "title": "Sobre", "url": "/pages/sobre" },
      { "title": "Contato", "url": "/pages/contato" },
      { "title": "Rastreamento", "url": "/pages/rastreamento" }
    ]
  },
  "footerMenu": {
    "title": "Footer",
    "handle": "footer",
    "items": [
      { "title": "PolÃ­tica de Privacidade", "url": "/policies/privacy-policy" },
      { "title": "Termos de ServiÃ§o", "url": "/policies/terms-of-service" },
      { "title": "PolÃ­tica de Reembolso", "url": "/policies/refund-policy" },
      { "title": "PolÃ­tica de Envio", "url": "/policies/shipping-policy" },
      { "title": "Contato", "url": "/pages/contato" }
    ]
  },
  "pages": [
    { "title": "Sobre", "handle": "sobre", "body": "<html>" },
    { "title": "Contato", "handle": "contato", "body": "<html>" },
    { "title": "Rastreamento", "handle": "rastreamento", "body": "<html>" },
    { "title": "FAQ", "handle": "faq", "body": "<html>" }
  ],
  "copyright": "2025 ${storeName} - Todos os Direitos Reservados"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseJsonResponse<StoreSetup>(text);
}

export async function generateImageEditPrompt(
  originalImageUrl: string,
  productTitle: string,
  context?: StoreContext
): Promise<string> {
  const brandContext = context
    ? `\nContexto da marca: Loja "${context.name}" no nicho "${context.niche}". Idioma da loja: ${targetLanguage(context)}. ${context.brandVoice ? `Estilo: ${context.brandVoice}.` : ""} ${context.storeDescription || ""}`
    : "";

  const prompt = `VocÃª Ã© um especialista em descriÃ§Ã£o de imagens para e-commerce.

Analise a imagem de produto disponÃ­vel nesta URL: ${originalImageUrl}

Produto: "${productTitle}"${brandContext}

Sua tarefa: criar uma descriÃ§Ã£o DETALHADA da imagem para que um modelo de geraÃ§Ã£o de imagens possa recriar esta foto de produto de forma limpa e profissional, SEM:
- Logos ou marcas d'Ã¡gua do AliExpress
- Textos em chinÃªs
- Watermarks de qualquer tipo
- Fundos poluÃ­dos

A descriÃ§Ã£o deve incluir:
1. Produto principal: o que Ã©, cor, formato, materiais visÃ­veis
2. Ã‚ngulo da foto: frontal, lateral, 45 graus, flat lay, etc.
3. Fundo: cor sÃ³lida (branco preferÃ­vel), gradiente, ou contexto de uso
4. IluminaÃ§Ã£o: suave, direcional, estÃºdio, natural
5. ComposiÃ§Ã£o: centralizado, com espaÃ§o negativo, close-up, etc.
6. Detalhes relevantes: texturas, acabamentos, elementos decorativos

Formato da resposta: um parÃ¡grafo Ãºnico e detalhado em inglÃªs, otimizado como prompt para geraÃ§Ã£o de imagem. Comece com "Product photography of..." e seja especÃ­fico sobre cada detalhe visual.

Responda APENAS com o prompt de imagem, sem explicaÃ§Ãµes adicionais.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

function sanitizeJsonString(str: string): string {
  // Remove control characters (except \n, \r, \t which are valid in JSON strings)
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function parseJsonResponse<T>(text: string): T {
  // Remover markdown code blocks se presentes
  const cleaned = sanitizeJsonString(
    text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim()
  );

  // Tentar parse direto
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback: extrair JSON do texto
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;

    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]) as T;

    throw new Error("A IA nÃ£o retornou JSON vÃ¡lido. Tente novamente.");
  }
}


