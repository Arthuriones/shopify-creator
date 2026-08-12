-- Tokens que o usuario cola no Claude dele para acessar as proprias lojas
-- via MCP. Guardamos apenas o hash: o valor em claro aparece uma unica vez,
-- no momento da criacao.
create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Claude',
  token_hash text not null unique,
  -- Ultimos 4 caracteres, so para o usuario reconhecer qual token e qual
  -- na lista sem nunca reexibir o segredo.
  token_suffix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tokens_user_idx on public.mcp_tokens(user_id);
-- A verificacao no /api/mcp busca por hash em toda requisicao.
create index if not exists mcp_tokens_hash_idx on public.mcp_tokens(token_hash);

alter table public.mcp_tokens enable row level security;

drop policy if exists "Users read own mcp tokens" on public.mcp_tokens;
create policy "Users read own mcp tokens"
  on public.mcp_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Users create own mcp tokens" on public.mcp_tokens;
create policy "Users create own mcp tokens"
  on public.mcp_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users revoke own mcp tokens" on public.mcp_tokens;
create policy "Users revoke own mcp tokens"
  on public.mcp_tokens for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own mcp tokens" on public.mcp_tokens;
create policy "Users delete own mcp tokens"
  on public.mcp_tokens for delete
  using (auth.uid() = user_id);
