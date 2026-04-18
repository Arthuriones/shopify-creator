-- Configuracoes de moeda e preco por loja
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS auto_convert_prices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_rate numeric(12,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_markup_percent numeric(8,2) NOT NULL DEFAULT 0;
