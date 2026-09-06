-- Quantos produtos cada loja tem, e quando isso foi conferido.
--
-- A tela de lojas mostra "482 produtos, sync 4 min atras". Buscar isso na
-- Shopify a cada carregamento significaria paginar o catalogo inteiro de cada
-- loja toda vez que alguem abre a pagina -- lento, e estoura o limite de
-- chamadas com cinco lojas.
--
-- Entao vira campo. Quem preenche e o auto-conserto, que ja pagina o catalogo
-- das duas lojas de hora em hora: o numero sai de graca de uma passada que
-- ja acontece.
--
-- NULL = nunca conferido. A tela mostra "—" em vez de fingir que sao zero
-- produtos, que e diferente e assustaria o lojista.

alter table public.stores
  add column if not exists product_count integer,
  add column if not exists variant_count integer,
  add column if not exists catalog_synced_at timestamptz;

comment on column public.stores.product_count is
  'Produtos no catalogo, contados na ultima passada do auto-conserto. NULL = nunca conferido.';
comment on column public.stores.variant_count is
  'Variantes no catalogo. NULL = nunca conferido.';
comment on column public.stores.catalog_synced_at is
  'Quando product_count/variant_count foram atualizados.';
