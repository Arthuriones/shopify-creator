-- ============================================================================
-- Billing + creditos de IA (SaaS)
-- Fase 1: schema. Fase 2 (medicao) usa ai_usage_log para registrar custo real.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: 1 por usuario. Guarda plano, assinatura (Stripe) e saldo de creditos.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    is_admin boolean not null default false,
    -- plano: 'free' (sem assinatura) | 'pro' (R$89/mes)
    plan text not null default 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    -- 'active' | 'past_due' | 'canceled' | 'incomplete' | null
    subscription_status text,
    current_period_end timestamptz,
    -- saldo de creditos de IA (1 credito = 1 produto neutralizado com foto).
    -- Inclui os creditos do plano + recargas. Reseta no inicio de cada ciclo.
    ai_credits integer not null default 0,
    credits_reset_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

-- Helper SECURITY DEFINER: evita recursao de RLS ao checar admin nas policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        (select p.is_admin from public.profiles p where p.id = auth.uid()),
        false
    );
$$;

-- Usuario ve/edita o proprio perfil; admin ve todos.
-- (campos sensiveis como ai_credits/plan so mudam via service role/funcoes.)
create policy "profiles_select_own_or_admin"
    on public.profiles for select
    using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
    on public.profiles for update
    using (auth.uid() = id);

create trigger set_profiles_updated_at
    before update on public.profiles
    for each row execute function public.update_updated_at();

-- Cria o profile automaticamente quando um usuario novo se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Backfill: cria profile para usuarios ja existentes.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- ai_usage_log: registra TODA acao de IA com custo (medicao / margem / admin).
-- ----------------------------------------------------------------------------
create table if not exists public.ai_usage_log (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    store_id uuid references public.stores on delete set null,
    -- 'neutralize_image' | 'neutralize_text' | 'translate' | 'clone' | 'optimize' | 'other'
    action text not null,
    -- custo estimado em USD (Gemini). credits_used = creditos debitados (0 p/ acoes gratuitas).
    cost_usd numeric(10, 5) not null default 0,
    credits_used integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_usage_log_user_created_idx
    on public.ai_usage_log (user_id, created_at desc);
create index if not exists ai_usage_log_action_idx
    on public.ai_usage_log (action, created_at desc);

alter table public.ai_usage_log enable row level security;

create policy "ai_usage_select_own_or_admin"
    on public.ai_usage_log for select
    using (auth.uid() = user_id or public.is_admin());
-- Insert e feito pelo backend com service role (bypassa RLS); sem policy de insert.

-- ----------------------------------------------------------------------------
-- credit_purchases: recargas avulsas de creditos (pacotes).
-- ----------------------------------------------------------------------------
create table if not exists public.credit_purchases (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    stripe_payment_id text,
    credits integer not null,
    amount_cents integer not null,
    currency text not null default 'brl',
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists credit_purchases_user_idx
    on public.credit_purchases (user_id, created_at desc);

alter table public.credit_purchases enable row level security;

create policy "credit_purchases_select_own_or_admin"
    on public.credit_purchases for select
    using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- Funcoes de credito (atomicas). SECURITY DEFINER: chamadas pelo backend.
-- ----------------------------------------------------------------------------

-- Debita N creditos se houver saldo. Retorna true se debitou, false se faltou.
create or replace function public.consume_ai_credits(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    ok boolean;
begin
    update public.profiles
       set ai_credits = ai_credits - p_amount,
           updated_at = timezone('utc', now())
     where id = p_user_id
       and ai_credits >= p_amount
    returning true into ok;
    return coalesce(ok, false);
end;
$$;

-- Soma creditos (recarga). Retorna o novo saldo.
create or replace function public.add_ai_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    new_balance integer;
begin
    update public.profiles
       set ai_credits = ai_credits + p_amount,
           updated_at = timezone('utc', now())
     where id = p_user_id
    returning ai_credits into new_balance;
    return new_balance;
end;
$$;

-- Reseta o saldo para o incluido no plano (chamado quando a fatura mensal paga).
create or replace function public.reset_ai_credits(
    p_user_id uuid,
    p_amount integer,
    p_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.profiles
       set ai_credits = p_amount,
           credits_reset_at = timezone('utc', now()),
           current_period_end = p_period_end,
           updated_at = timezone('utc', now())
     where id = p_user_id;
end;
$$;
