// Tipos compartilhados entre a tela de produtos e o editor, que virou
// modulo proprio para sair do primeiro download da rota.

export interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  logo_path: string | null;
  currency_code: string;
  auto_convert_prices: boolean;
  currency_rate: number;
  price_markup_percent: number;
}

export type LogoPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface AvailableLogo {
  path: string;
  label: string;
  url: string;
}

export function formatPrice(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode || "USD"} ${value.toFixed(2)}`;
  }
}


export const LOGO_POSITION_OPTIONS: { value: LogoPosition; label: string }[] = [
  { value: "top-left", label: "↖ Topo esq" },
  { value: "top-center", label: "↑ Topo" },
  { value: "top-right", label: "↗ Topo dir" },
  { value: "center-left", label: "← Centro esq" },
  { value: "center", label: "● Centro" },
  { value: "center-right", label: "→ Centro dir" },
  { value: "bottom-left", label: "↙ Inf esq" },
  { value: "bottom-center", label: "↓ Inferior" },
  { value: "bottom-right", label: "↘ Inf dir" },
];


export interface PerImageLogoConfig {
  position: LogoPosition;
  scale: number;
  margin: number;
  opacity: number;
  logoPath?: string;
}
