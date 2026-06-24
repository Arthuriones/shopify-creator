// Configuracao de planos e pacotes de credito do SaaS.

// Preco do plano Pro (R$/mes). Usado para calcular MRR no painel admin.
export const PRO_PRICE_BRL = 89;

// Creditos de IA inclusos no plano Pro (R$89/mes). 1 credito = 1 produto
// neutralizado com foto. Resetados a cada fatura paga.
export const PRO_INCLUDED_CREDITS = 20;

// Pacotes de recarga avulsos (one-time). amountCents em BRL (centavos).
export interface CreditPack {
  id: string;
  credits: number;
  amountCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_50", credits: 50, amountCents: 3900, label: "50 créditos" },
  { id: "pack_200", credits: 200, amountCents: 11900, label: "200 créditos" },
  { id: "pack_500", credits: 500, amountCents: 24900, label: "500 créditos" },
];

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}
