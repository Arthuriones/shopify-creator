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
  context: StoreContext
): Promise<OptimizationResult> {
  const language = targetLanguage(context);
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
  const prompt = `Gere políticas profissionais e completas para a loja Shopify "${context.name}" no nicho "${context.niche}".

Público-alvo: "${context.targetAudience || "Não especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "Não especificado"}"
Idioma final obrigatório: "${language}"

Gere 4 políticas no idioma final obrigatório:
1. Política de Reembolso
2. Política de Privacidade
3. Termos de Serviço
4. Política de Envio

Contexto da loja:
- Loja brasileira de e-commerce (Shopify)
- Prazo de entrega: 15 a 30 dias úteis (envio internacional)
- Prazo de reembolso: 7 dias após recebimento (CDC brasileiro)
- Prazo de troca: 7 dias após recebimento
- Pagamentos: cartão de crédito (até 12x), PIX, boleto
- Rastreamento disponível para todos os pedidos
- Deve seguir o Código de Defesa do Consumidor (CDC)
- Deve mencionar LGPD na política de privacidade

Cada política deve:
- Ser profissional e transmitir confiança
- Estar formatada em HTML limpo
- Ser completa mas objetiva
- Usar linguagem acessível
- Estar 100% no idioma final obrigatório "${language}"

Responda APENAS em JSON válido:
[
  { "type": "refund", "title": "Política de Reembolso", "body": "<html>" },
  { "type": "privacy", "title": "Política de Privacidade", "body": "<html>" },
  { "type": "terms", "title": "Termos de Serviço", "body": "<html>" },
  { "type": "shipping", "title": "Política de Envio", "body": "<html>" }
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
  const prompt = `Você é um especialista em design e conversão de lojas Shopify brasileiras.

Loja: "${context.name}"
Nicho: "${context.niche}"
Público-alvo: "${context.targetAudience || "Não especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "Não especificado"}"
Tema atual: "${currentTheme}"
Idioma da resposta: "${language}"

Contexto: a loja usa um tema brasileiro otimizado com:
- Botão "Comprar Agora" verde (#16c789) direto pro checkout
- Countdown timer de ofertas
- Barra de escassez ("Restam X unidades")
- Calculadora de frete por CEP
- Badges de pagamento (Visa, Mastercard, PIX, etc)
- Seções de confiança (devolução, envio nacional)
- Parcelamento em até 12x
- Frete grátis acima de R$200
- Instagram feed integrado
- Fonte Montserrat

Sugira melhorias ESPECÍFICAS e PRÁTICAS para aumentar conversão. Inclua:
1. Melhorias na página de produto (acima da dobra)
2. Melhorias na homepage (hero, produtos em destaque)
3. Elementos de prova social e confiança
4. Otimizações mobile
5. Cores e tipografia que funcionam no nicho "${context.niche}"

Seja direto e prático. Cada sugestão deve ser acionável.
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
  const prompt = `Você é um especialista em configuração de lojas Shopify brasileiras de dropshipping usando o tema Vessel.

Gere a configuração COMPLETA da loja "${storeName}" no nicho "${niche}".

Público-alvo: "${context.targetAudience || "Não especificado"}"
Voz da marca: "${context.brandVoice || "Profissional e confiante"}"
Sobre a loja: "${context.storeDescription || "Não especificado"}"
Idioma final obrigatório para políticas, páginas, menus, FAQ e copyright: "${language}"

CONTEXTO DO TEMA VESSEL:
- Header usa menu com handle "main-menu"
- Footer usa menu com handle "footer"
- Footer tem bloco de links de políticas que renderiza automaticamente das políticas do Shopify
- Políticas são publicadas via shopPolicyUpdate mutation (tipos: refund, privacy, terms, shipping)
- Páginas adicionais (Sobre, Contato, FAQ) são Shopify Pages
- Botão CTA verde (#16c789), countdown timer, barra de escassez, badges de pagamento
- Parcelamento 12x, frete grátis acima de R$200

GERE:

1. **4 Políticas** (refund, privacy, terms, shipping):
   - HTML limpo e profissional
   - Conformidade com CDC (Código de Defesa do Consumidor)
   - LGPD na política de privacidade
   - Prazo de entrega: 15-30 dias úteis
   - Reembolso: 7 dias após recebimento
   - Pagamentos: cartão (até 12x), PIX, boleto
   - Rastreamento disponível para todos os pedidos

2. **Menu principal** (handle: main-menu):
   - Início (/)
   - Catálogo (/collections/all)
   - Sobre (/pages/sobre)
   - Contato (/pages/contato)
   - Rastreamento (/pages/rastreamento)

3. **Menu footer** (handle: footer):
   - Política de Privacidade (/policies/privacy-policy)
   - Termos de Serviço (/policies/terms-of-service)
   - Política de Reembolso (/policies/refund-policy)
   - Política de Envio (/policies/shipping-policy)
   - Contato (/pages/contato)

4. **Páginas** (Shopify Pages):
   - **Sobre**: história profissional da marca no nicho "${niche}", tom confiante e aspiracional
   - **Contato**: formulário conceitual com email placeholder (contato@${storeName.toLowerCase().replace(/\s+/g, "")}.com.br) e menção a WhatsApp
   - **Rastreamento**: explica como rastrear pedidos passo a passo, menciona prazo de 15-30 dias úteis, link para 17track.net
   - **FAQ**: perguntas frequentes sobre prazo de entrega, formas de pagamento, trocas/devoluções, como escolher tamanho, segurança do site

5. **Copyright**: "2025 ${storeName} - Todos os Direitos Reservados"

REGRAS:
- TUDO no idioma final obrigatório "${language}"
- Tom profissional, transmitir confiança
- HTML limpo sem CSS inline excessivo, usar tags semânticas (h2, h3, p, ul, li)
- NÃO mencionar China, AliExpress, importação, dropshipping
- Políticas devem parecer de uma marca brasileira estabelecida
- FAQ deve abordar dúvidas reais de compradores online brasileiros

Responda APENAS em JSON válido:
{
  "policies": [
    { "type": "refund", "title": "Política de Reembolso", "body": "<html>" },
    { "type": "privacy", "title": "Política de Privacidade", "body": "<html>" },
    { "type": "terms", "title": "Termos de Serviço", "body": "<html>" },
    { "type": "shipping", "title": "Política de Envio", "body": "<html>" }
  ],
  "mainMenu": {
    "title": "Main menu",
    "handle": "main-menu",
    "items": [
      { "title": "Início", "url": "/" },
      { "title": "Catálogo", "url": "/collections/all" },
      { "title": "Sobre", "url": "/pages/sobre" },
      { "title": "Contato", "url": "/pages/contato" },
      { "title": "Rastreamento", "url": "/pages/rastreamento" }
    ]
  },
  "footerMenu": {
    "title": "Footer",
    "handle": "footer",
    "items": [
      { "title": "Política de Privacidade", "url": "/policies/privacy-policy" },
      { "title": "Termos de Serviço", "url": "/policies/terms-of-service" },
      { "title": "Política de Reembolso", "url": "/policies/refund-policy" },
      { "title": "Política de Envio", "url": "/policies/shipping-policy" },
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

  const prompt = `Você é um especialista em descrição de imagens para e-commerce.

Analise a imagem de produto disponível nesta URL: ${originalImageUrl}

Produto: "${productTitle}"${brandContext}

Sua tarefa: criar uma descrição DETALHADA da imagem para que um modelo de geração de imagens possa recriar esta foto de produto de forma limpa e profissional, SEM:
- Logos ou marcas d'água do AliExpress
- Textos em chinês
- Watermarks de qualquer tipo
- Fundos poluídos

A descrição deve incluir:
1. Produto principal: o que é, cor, formato, materiais visíveis
2. Ângulo da foto: frontal, lateral, 45 graus, flat lay, etc.
3. Fundo: cor sólida (branco preferível), gradiente, ou contexto de uso
4. Iluminação: suave, direcional, estúdio, natural
5. Composição: centralizado, com espaço negativo, close-up, etc.
6. Detalhes relevantes: texturas, acabamentos, elementos decorativos

Formato da resposta: um parágrafo único e detalhado em inglês, otimizado como prompt para geração de imagem. Comece com "Product photography of..." e seja específico sobre cada detalhe visual.

Responda APENAS com o prompt de imagem, sem explicações adicionais.`;

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

    throw new Error("A IA não retornou JSON válido. Tente novamente.");
  }
}
