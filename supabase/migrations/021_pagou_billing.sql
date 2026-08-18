-- ============================================================================
-- Migracao de cobranca: Stripe -> Pagou.ai
--
-- A Pagou nao tem checkout hospedado nem portal do cliente: o cartao e
-- tokenizado no browser (Payment Element) e a assinatura/transacao e criada
-- server-side. Por isso guardamos ids proprios e o estado das cobrancas Pix,
-- que sao assincronas (o usuario paga o QR e o webhook avisa depois).
--
-- As colunas stripe_* ficam por enquanto: ha assinaturas ativas legadas que
-- so podem sair depois que os assinantes migrarem. Nao usar em codigo novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: ids da Pagou + de qual provedor veio a assinatura vigente.
-- ----------------------------------------------------------------------------
alter table public.profiles
    add column if not exists pagou_customer_id text,
    add column if not exists pagou_subscription_id text,
    add column if not exists payment_provider text not null default 'pagou',
    -- a Pagou so cancela no fim do periodo; o app precisa mostrar isso.
    add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.profiles.payment_provider is
    'pagou = fluxo atual. stripe = assinatura legada, somente leitura.';
comment on column public.profiles.stripe_customer_id is
    'LEGADO. Nao usar em codigo novo — ver payment_provider.';
comment on column public.profiles.stripe_subscription_id is
    'LEGADO. Nao usar em codigo novo — ver payment_provider.';

-- Quem ja tem assinatura Stripe continua marcado como tal.
update public.profiles
   set payment_provider = 'stripe'
 where stripe_subscription_id is not null
   and payment_provider = 'pagou';

create index if not exists profiles_pagou_customer_idx
    on public.profiles (pagou_customer_id);
create index if not exists profiles_pagou_subscription_idx
    on public.profiles (pagou_subscription_id);

-- ----------------------------------------------------------------------------
-- credit_purchases: recarga por Pix nasce PENDENTE e so vira paga no webhook.
-- ----------------------------------------------------------------------------
alter table public.credit_purchases
    add column if not exists pagou_transaction_id text,
    add column if not exists provider text not null default 'pagou',
    add column if not exists method text,
    add column if not exists pack_id text,
    add column if not exists status text not null default 'paid',
    add column if not exists credited_at timestamptz;

-- Historico da Stripe entrou sempre ja pago.
update public.credit_purchases
   set provider = 'stripe', status = 'paid'
 where stripe_payment_id is not null
   and provider = 'pagou';

alter table public.credit_purchases
    alter column stripe_payment_id drop not null;

-- Uma transacao da Pagou so pode gerar uma recarga. E a trava que impede
-- credito em dobro se o webhook chegar repetido.
create unique index if not exists credit_purchases_pagou_tx_uidx
    on public.credit_purchases (pagou_transaction_id)
    where pagou_transaction_id is not null;

create index if not exists credit_purchases_status_idx
    on public.credit_purchases (status, created_at desc);

-- ----------------------------------------------------------------------------
-- payment_events: deduplicacao de webhook.
--
-- A Pagou nao documenta assinatura HMAC no webhook, entao o handler nunca
-- confia no corpo recebido: ele so usa o evento como aviso e confirma o
-- estado real via GET autenticado na API. Esta tabela garante que o mesmo
-- evento nao seja processado duas vezes (a doc pede dedupe pelo id de topo).
-- ----------------------------------------------------------------------------
create table if not exists public.payment_events (
    id text primary key,
    provider text not null default 'pagou',
    event text,
    event_type text,
    resource_id text,
    payload jsonb not null default '{}'::jsonb,
    processed_at timestamptz,
    error text,
    received_at timestamptz not null default timezone('utc', now())
);

create index if not exists payment_events_resource_idx
    on public.payment_events (resource_id);
create index if not exists payment_events_received_idx
    on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;
-- Sem policy: so o backend (service role) le e escreve.

-- ----------------------------------------------------------------------------
-- Credita uma recarga de forma atomica e idempotente.
--
-- Marca a compra como paga e soma os creditos numa transacao so. Se a compra
-- ja estiver paga, nao faz nada e devolve false — e o que protege contra
-- webhook duplicado e contra corrida entre webhook e polling de status.
-- ----------------------------------------------------------------------------
create or replace function public.credit_pending_purchase(p_transaction_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_credits integer;
begin
    -- trava a linha: se dois webhooks chegarem juntos, o segundo espera.
    select user_id, credits
      into v_user_id, v_credits
      from public.credit_purchases
     where pagou_transaction_id = p_transaction_id
       and status <> 'paid'
       for update;

    if v_user_id is null then
        return false;   -- inexistente ou ja creditada
    end if;

    update public.credit_purchases
       set status = 'paid',
           credited_at = timezone('utc', now())
     where pagou_transaction_id = p_transaction_id;

    update public.profiles
       set ai_credits = ai_credits + v_credits,
           updated_at = timezone('utc', now())
     where id = v_user_id;

    return true;
end;
$$;

revoke all on function public.credit_pending_purchase(text) from public, anon, authenticated;
grant execute on function public.credit_pending_purchase(text) to service_role;
