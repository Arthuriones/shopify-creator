// Configuracao de planos e pacotes de credito do SaaS.

// Preco do plano Pro (USD/mes). Usado para calcular MRR no painel admin.
export const PRO_PRICE_USD = 17;

// Creditos de IA inclusos no plano Pro ($17/mes). 1 credito = 1 produto
// neutralizado com foto. Resetados a cada fatura paga.
export const PRO_INCLUDED_CREDITS = 20;

// Trial: quantas lojas uma conta nova pode clonar de graca antes de assinar.
// A trava usa profiles.free_clone_store_id (1 loja), entao manter em 1.
export const FREE_CLONE_LIMIT = 1;

// Pacotes de recarga avulsos (one-time). amountCents em USD (cents).
export interface CreditPack {
  id: string;
  credits: number;
  amountCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_50",  credits: 50,  amountCents: 500,  label: "50 credits" },
  { id: "pack_200", credits: 200, amountCents: 1500, label: "200 credits" },
  { id: "pack_500", credits: 500, amountCents: 3000, label: "500 credits" },
];

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}
