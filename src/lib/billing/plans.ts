// Configuracao de planos e pacotes de credito do SaaS.
// Cobranca via Pagou.ai. Valores em BRL porque Pix so existe em real.

export const CURRENCY = "BRL";

// Preco do plano Pro (BRL/mes). Usado no checkout e para calcular MRR no admin.
export const PRO_PRICE_CENTS = 8900; // R$ 89,00
export const PRO_PRICE_BRL = PRO_PRICE_CENTS / 100;

// Creditos de IA inclusos no plano Pro. 1 credito = 1 produto neutralizado
// com foto. Resetados a cada cobranca paga da assinatura.
export const PRO_INCLUDED_CREDITS = 20;

// Trial: quantas lojas uma conta nova pode clonar de graca antes de assinar.
// A trava usa profiles.free_clone_store_id (1 loja), entao manter em 1.
export const FREE_CLONE_LIMIT = 1;

// Pacotes de recarga avulsos (Pix, pagamento unico). amountCents em BRL.
export interface CreditPack {
  id: string;
  credits: number;
  amountCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_50", credits: 50, amountCents: 2500, label: "50 créditos" },
  { id: "pack_200", credits: 200, amountCents: 7500, label: "200 créditos" },
  { id: "pack_500", credits: 500, amountCents: 15000, label: "500 créditos" },
];

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Taxa usada APENAS no painel admin, para comparar receita (BRL, Pagou) com
// custo de IA (USD, Gemini) na mesma unidade. Nao afeta cobranca nenhuma.
// Ajuste por env quando o cambio andar demais.
export const USD_BRL_REPORTING = Number(process.env.USD_BRL_RATE) || 5.4;
