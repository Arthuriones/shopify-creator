-- Registra toda vez que o loader da vitrine cai pro checkout nativo (em vez
-- de rotear pra dark store). Sem isso, "checkout abandonado na vitrine" e um
-- sintoma sem causa visivel -- aqui fica o motivo exato (erro de resolve,
-- timeout, sem itens roteaveis etc.) pra investigar e corrigir.
create table if not exists routed_checkout_fallbacks (
  id uuid primary key default gen_random_uuid(),
  route_config_id uuid references routed_checkout_configs(id) on delete cascade,
  reason text not null,
  detail text,
  page_url text,
  created_at timestamptz not null default now()
);

create index if not exists routed_checkout_fallbacks_route_idx
  on routed_checkout_fallbacks (route_config_id, created_at desc);

alter table routed_checkout_fallbacks enable row level security;

create policy "Owners can read their route fallbacks"
  on routed_checkout_fallbacks for select
  using (
    exists (
      select 1 from routed_checkout_configs c
      where c.id = routed_checkout_fallbacks.route_config_id
        and c.user_id = auth.uid()
    )
  );
