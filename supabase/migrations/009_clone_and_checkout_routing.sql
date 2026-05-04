create table if not exists public.clone_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_domain text not null,
  target_store_id uuid references public.stores(id) on delete set null,
  action text not null check (action in ('preview', 'export-json', 'export-csv', 'apply')),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  product_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

alter table public.clone_runs enable row level security;

create policy "Users can manage their own clone runs"
  on public.clone_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.routed_checkout_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_store_id uuid not null references public.stores(id) on delete cascade,
  target_store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  mode text not null default 'standard' check (mode in ('standard', 'enterprise', 'enterprise_static')),
  public_token uuid not null default gen_random_uuid() unique,
  enabled boolean not null default true,
  sku_map jsonb not null default '{}'::jsonb,
  variant_map jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routed_checkout_configs enable row level security;

create policy "Users can manage their routed checkout configs"
  on public.routed_checkout_configs for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.stores
      where stores.id = source_store_id and stores.user_id = auth.uid()
    )
    and exists (
      select 1 from public.stores
      where stores.id = target_store_id and stores.user_id = auth.uid()
    )
  );

create trigger routed_checkout_configs_updated_at
  before update on public.routed_checkout_configs
  for each row execute function public.update_updated_at();

create index if not exists idx_clone_runs_user_id on public.clone_runs(user_id);
create index if not exists idx_routed_checkout_configs_user_id on public.routed_checkout_configs(user_id);
create index if not exists idx_routed_checkout_configs_public_token on public.routed_checkout_configs(public_token);
