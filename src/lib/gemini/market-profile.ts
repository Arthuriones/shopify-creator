// Fatos de mercado usados na geracao de policies e de conteudo por IA.
//
// Antes o prompt de policies embutia o contexto brasileiro fixo (CDC, LGPD,
// PIX, boleto, 12x, "loja brasileira") mesmo quando a loja estava configurada
// em japones ou espanhol. O resultado era conteudo juridico errado para o
// mercado — uma loja no Chile recebia policy citando o CDC brasileiro.
//
// Estes perfis sao derivados do `target_language` da loja.

export interface MarketProfile {
  /** Nome do mercado, para o prompt. */
  market: string;
  /** Moeda usada nos exemplos. */
  currency: string;
  /** Prazo de devolucao/arrependimento tipico do mercado. */
  returnWindow: string;
  /** Base legal de consumo a citar. */
  consumerLaw: string;
  /** Lei de protecao de dados a citar na politica de privacidade. */
  privacyLaw: string;
  /** Meios de pagamento comuns. */
  payments: string;
  /** Estimativa de entrega padrao. */
  delivery: string;
  /** Observacoes obrigatorias especificas do pais. */
  notes?: string;
}

const PROFILES: Record<string, MarketProfile> = {
  pt: {
    market: "Brasil",
    currency: "BRL (R$)",
    returnWindow: "7 dias corridos apos o recebimento (direito de arrependimento)",
    consumerLaw: "Codigo de Defesa do Consumidor (CDC)",
    privacyLaw: "LGPD (Lei Geral de Protecao de Dados)",
    payments: "cartao de credito (ate 12x), PIX e boleto",
    delivery: "15 a 30 dias uteis",
  },
  es: {
    market: "America Latina de lingua espanhola",
    currency: "moeda local do pais da loja",
    returnWindow: "10 dias corridos apos o recebimento",
    consumerLaw: "legislacao de defesa do consumidor local",
    privacyLaw: "legislacao local de protecao de dados pessoais",
    payments: "cartao de credito/debito e meios locais (ex.: WebPay, Mercado Pago)",
    delivery: "15 a 30 dias uteis",
  },
  ja: {
    market: "Japao",
    currency: "JPY (円)",
    returnWindow: "8 dias apos o recebimento (padrao de mercado no Japao)",
    consumerLaw: "特定商取引法 (Lei de Transacoes Comerciais Especificas)",
    privacyLaw: "個人情報保護法 (Lei de Protecao de Informacoes Pessoais / APPI)",
    payments: "cartao de credito, conveniencia (konbini) e carteiras digitais",
    delivery: "7 a 14 dias uteis",
    notes:
      "No Japao a pagina 特定商取引法に基づく表記 e obrigatoria: cite que os dados do vendedor (nome, endereco, contato) estao publicados nela.",
  },
  en: {
    market: "internacional (mercado de lingua inglesa)",
    currency: "USD ($)",
    returnWindow: "30 dias apos o recebimento",
    consumerLaw: "legislacao de defesa do consumidor aplicavel",
    privacyLaw: "GDPR/CCPA conforme a jurisdicao do cliente",
    payments: "cartao de credito/debito e carteiras digitais",
    delivery: "10 a 20 dias uteis",
  },
};

const FALLBACK: MarketProfile = PROFILES.en;

/**
 * Resolve o perfil de mercado a partir do idioma da loja ("pt-BR", "es-CL",
 * "ja-JP", "en-US"...). Cai no perfil internacional quando desconhecido.
 */
export function marketProfileFor(targetLanguage: string | undefined | null): MarketProfile {
  const base = (targetLanguage || "").toLowerCase().split(/[-_]/)[0];
  return PROFILES[base] || FALLBACK;
}

/** Bloco pronto para injetar no prompt. */
export function marketContextBlock(targetLanguage: string | undefined | null): string {
  const profile = marketProfileFor(targetLanguage);
  return [
    `- Mercado: ${profile.market}`,
    `- Moeda: ${profile.currency}`,
    `- Prazo de entrega: ${profile.delivery}`,
    `- Prazo de devolucao: ${profile.returnWindow}`,
    `- Meios de pagamento: ${profile.payments}`,
    `- Base legal de consumo a citar: ${profile.consumerLaw}`,
    `- Lei de protecao de dados a citar: ${profile.privacyLaw}`,
    profile.notes ? `- Observacao obrigatoria: ${profile.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
