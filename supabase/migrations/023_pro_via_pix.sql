-- ============================================================================
-- Plano Pro pago por Pix avulso (sem recorrencia).
--
-- Por que existe: a Pagou so faz assinatura recorrente por cartao. O
-- pix_automatic da UNSUPPORTED_PAYMENT_METHOD nesta conta, e o checkout
-- hospedado nao suporta recorrencia. Quem nao quer (ou nao tem) cartao ficava
-- sem caminho nenhum para pagar.
--
-- Modelo: uma cobranca Pix comum concede 30 dias de Pro. Nao renova sozinho —
-- o usuario paga de novo quando quiser. O credito e a extensao do plano
-- acontecem na mesma funcao atomica que ja usamos para recarga.
-- ============================================================================

alter table public.credit_purchases
    add column if not exists kind text not null default 'credits';

comment on column public.credit_purchases.kind is
    'credits = recarga avulsa. pro_month = 30 dias de plano Pro por Pix.';

create index if not exists credit_purchases_kind_idx
    on public.credit_purchases (kind, status);

-- ----------------------------------------------------------------------------
-- Aplica uma compra paga, seja recarga ou mes de Pro.
--
-- Substitui credit_pending_purchase(): mesma trava de linha e mesma garantia
-- de idempotencia, mas agora tambem estende o plano quando kind = 'pro_month'.
-- Se a compra ja estiver paga, devolve false e nao faz nada — e o que protege
-- contra webhook duplicado e contra corrida entre webhook e polling.
-- ----------------------------------------------------------------------------
create or replace function public.apply_paid_purchase(p_transaction_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_credits integer;
    v_kind    text;
    v_fim     timestamptz;
begin
    select user_id, credits, kind
      into v_user_id, v_credits, v_kind
      from public.credit_purchases
     where pagou_transaction_id = p_transaction_id
       and status <> 'paid'
       for update;

    if v_user_id is null then
        return false;   -- inexistente ou ja aplicada
    end if;

    update public.credit_purchases
       set status = 'paid',
           credited_at = timezone('utc', now())
     where pagou_transaction_id = p_transaction_id;

    if v_kind = 'pro_month' then
        -- Empilha sobre o que ainda resta, para quem paga adiantado nao perder
        -- os dias que sobraram.
        select greatest(coalesce(current_period_end, timezone('utc', now())),
                        timezone('utc', now())) + interval '30 days'
          into v_fim
          from public.profiles
         where id = v_user_id;

        update public.profiles
           set plan = 'pro',
               subscription_status = 'active',
               payment_provider = 'pagou',
               current_period_end = v_fim,
               cancel_at_period_end = false,
               ai_credits = ai_credits + v_credits,
               credits_reset_at = timezone('utc', now()),
               updated_at = timezone('utc', now())
         where id = v_user_id;
    else
        update public.profiles
           set ai_credits = ai_credits + v_credits,
               updated_at = timezone('utc', now())
         where id = v_user_id;
    end if;

    return true;
end;
$$;

revoke all on function public.apply_paid_purchase(text) from public, anon, authenticated;
grant execute on function public.apply_paid_purchase(text) to service_role;

-- ----------------------------------------------------------------------------
-- Quem paga por Pix nao tem assinatura recorrente: o acesso vence sozinho.
-- Roda no cron horario que ja existe.
-- ----------------------------------------------------------------------------
create or replace function public.expire_pix_pro()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_qtd integer;
begin
    update public.profiles
       set plan = 'free',
           subscription_status = 'expired',
           updated_at = timezone('utc', now())
     where plan = 'pro'
       and payment_provider = 'pagou'
       and pagou_subscription_id is null      -- so os pagos por Pix avulso
       and current_period_end is not null
       and current_period_end < timezone('utc', now());
    get diagnostics v_qtd = row_count;
    return v_qtd;
end;
$$;

revoke all on function public.expire_pix_pro() from public, anon, authenticated;
grant execute on function public.expire_pix_pro() to service_role;
