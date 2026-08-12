-- Validade e limite de taxa para os tokens de MCP.
--
-- Contador em memoria nao serve: o app roda em Vercel e cada invocacao pode
-- cair em outra instancia. Como a verificacao do token ja consulta o banco em
-- toda chamada de ferramenta, o contador vive na mesma linha e sai de graca.

alter table public.mcp_tokens
  add column if not exists expires_at timestamptz not null default (now() + interval '90 days'),
  add column if not exists window_started_at timestamptz not null default now(),
  add column if not exists calls_in_window integer not null default 0;

-- Autentica, aplica janela e incrementa — tudo numa ida so e sob o lock da
-- linha, para duas chamadas simultaneas nao lerem o mesmo contador.
create or replace function public.mcp_authenticate(
  p_hash text,
  p_limit integer default 120,
  p_window interval default interval '1 minute'
)
returns table (
  user_id uuid,
  token_id uuid,
  allowed boolean,
  reason text,
  retry_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.mcp_tokens%rowtype;
begin
  select * into t from public.mcp_tokens where token_hash = p_hash for update;

  if not found then
    return query select null::uuid, null::uuid, false, 'invalid', 0;
    return;
  end if;

  if t.revoked_at is not null then
    return query select t.user_id, t.id, false, 'revoked', 0;
    return;
  end if;

  if t.expires_at <= now() then
    return query select t.user_id, t.id, false, 'expired', 0;
    return;
  end if;

  -- Janela fixa: passou o intervalo, zera e comeca de novo.
  if t.window_started_at + p_window <= now() then
    update public.mcp_tokens
       set window_started_at = now(), calls_in_window = 1, last_used_at = now()
     where id = t.id;
    return query select t.user_id, t.id, true, 'ok', 0;
    return;
  end if;

  if t.calls_in_window >= p_limit then
    return query
      select t.user_id, t.id, false, 'rate_limited',
             greatest(1, ceil(extract(epoch from (t.window_started_at + p_window - now())))::integer);
    return;
  end if;

  update public.mcp_tokens
     set calls_in_window = t.calls_in_window + 1, last_used_at = now()
   where id = t.id;
  return query select t.user_id, t.id, true, 'ok', 0;
end;
$$;

-- So o backend (service role) chama. Nunca o cliente.
revoke all on function public.mcp_authenticate(text, integer, interval) from public, anon, authenticated;
