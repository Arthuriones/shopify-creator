-- Stores table
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  access_token text not null,
  name text not null,
  theme_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, shop_domain)
);

-- Products table
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  aliexpress_url text not null,
  shopify_product_id text,
  title text not null,
  original_title text not null,
  description text not null default '',
  original_description text not null default '',
  price numeric(10,2) not null default 0,
  images text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'optimized', 'published', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS policies
alter table public.stores enable row level security;
alter table public.products enable row level security;

create policy "Users can manage their own stores"
  on public.stores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage products in their stores"
  on public.products for all
  using (store_id in (select id from public.stores where user_id = auth.uid()))
  with check (store_id in (select id from public.stores where user_id = auth.uid()));

-- Updated_at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger stores_updated_at
  before update on public.stores
  for each row execute function public.update_updated_at();

create trigger products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at();

-- Indexes
create index idx_stores_user_id on public.stores(user_id);
create index idx_products_store_id on public.products(store_id);
create index idx_products_status on public.products(status);
