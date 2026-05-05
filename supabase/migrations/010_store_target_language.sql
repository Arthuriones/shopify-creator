alter table public.stores
  add column if not exists target_language text not null default 'pt-BR';

comment on column public.stores.target_language is
  'Idioma principal usado pela IA para produtos, politicas, paginas, SEO e setup da loja.';
