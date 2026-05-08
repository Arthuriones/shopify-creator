create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instagram_user_id text not null,
  instagram_business_account_id text not null,
  instagram_username text,
  page_id text,
  page_name text,
  access_token text not null,
  page_access_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, instagram_business_account_id)
);

alter table public.instagram_connections enable row level security;

create policy "Users can manage their own Instagram connections"
  on public.instagram_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.update_updated_at();

create index if not exists idx_instagram_connections_user_id
  on public.instagram_connections(user_id);

create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete set null,
  caption text not null default '',
  image_urls text[] not null default '{}',
  product_ids text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  published_media_id text,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_posts enable row level security;

create policy "Users can manage their own Instagram posts"
  on public.instagram_posts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger instagram_posts_updated_at
  before update on public.instagram_posts
  for each row execute function public.update_updated_at();

create index if not exists idx_instagram_posts_user_id
  on public.instagram_posts(user_id, created_at desc);
