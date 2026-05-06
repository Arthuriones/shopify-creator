create table if not exists public.ai_product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id text not null,
  product_numeric_id text,
  product_handle text,
  product_title text not null,
  customer_name text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  title text not null,
  body text not null,
  product_use_case text not null default '',
  disclosure text not null default 'Conteudo gerado por IA / simulacao',
  image_url text,
  image_prompt text,
  source text not null default 'ai',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_product_reviews enable row level security;

create policy "Users can manage their own AI product reviews"
  on public.ai_product_reviews for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.stores
      where stores.id = store_id and stores.user_id = auth.uid()
    )
  );

create trigger ai_product_reviews_updated_at
  before update on public.ai_product_reviews
  for each row execute function public.update_updated_at();

create index if not exists idx_ai_product_reviews_store_product
  on public.ai_product_reviews(store_id, product_numeric_id, product_handle);

create index if not exists idx_ai_product_reviews_user_id
  on public.ai_product_reviews(user_id);

create index if not exists idx_ai_product_reviews_published
  on public.ai_product_reviews(store_id, published, created_at desc);
