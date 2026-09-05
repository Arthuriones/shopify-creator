-- Uma vitrine passa a poder apontar para VARIAS lojas de checkout.
--
-- Ate aqui routed_checkout_configs era 1:1 -- uma vitrine, uma dark store --
-- com o sku_map/variant_map morando na propria linha da rota. Isso impede
-- diluir volume entre varias contas de pagamento: se a conta cai, a vitrine
-- inteira para.
--
-- Agora cada destino vira uma linha em routed_checkout_targets, com o SEU
-- proprio mapa (os variant ids sao diferentes em cada loja de checkout, entao
-- o mapa nao da para compartilhar) e o seu peso no rodizio.
--
-- As colunas antigas de routed_checkout_configs (target_store_id, sku_map,
-- variant_map) ficam onde estao: sao a fonte do backfill, o destino primario
-- exibido no resumo, e o caminho de volta se algo aqui der errado.

create table if not exists public.routed_checkout_targets (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routed_checkout_configs(id) on delete cascade,
  target_store_id uuid not null references public.stores(id) on delete cascade,

  -- Peso relativo no sorteio, nao porcentagem: [2,1,1] = 50%/25%/25%.
  -- Peso 0 mantem o destino configurado mas fora do rodizio (util para
  -- aquecer uma conta nova antes de mandar trafego).
  weight integer not null default 1 check (weight >= 0 and weight <= 1000),
  enabled boolean not null default true,

  -- Mapas por destino: cada loja de checkout tem variant ids proprios.
  sku_map jsonb not null default '{}'::jsonb,
  variant_map jsonb not null default '{}'::jsonb,

  -- Override de dominio/mercado igual ao da rota, mas por destino.
  settings jsonb not null default '{}'::jsonb,

  position integer not null default 0,
  last_healed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A mesma loja de checkout duas vezes na mesma rota nao faz sentido: o
  -- sorteio so a favoreceria, e os dois mapas divergiriam com o tempo.
  unique (route_id, target_store_id)
);

create index if not exists routed_checkout_targets_route_idx
  on public.routed_checkout_targets (route_id, position);

-- O resolve publico busca os destinos ligados de uma rota a cada checkout.
create index if not exists routed_checkout_targets_active_idx
  on public.routed_checkout_targets (route_id)
  where enabled;

-- O heal roda de hora em hora e pega os destinos ha mais tempo sem revisao.
create index if not exists routed_checkout_targets_heal_idx
  on public.routed_checkout_targets (last_healed_at nulls first)
  where enabled;

create trigger routed_checkout_targets_updated_at
  before update on public.routed_checkout_targets
  for each row execute function public.update_updated_at();

alter table public.routed_checkout_targets enable row level security;

-- Mesma regra da rota: o dono da rota manda, e a loja de destino tem que ser
-- dele tambem (senao daria para rotear o checkout para a loja de outro).
create policy "Owners manage their route targets"
  on public.routed_checkout_targets for all
  using (
    exists (
      select 1 from public.routed_checkout_configs c
      where c.id = routed_checkout_targets.route_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.routed_checkout_configs c
      where c.id = routed_checkout_targets.route_id
        and c.user_id = auth.uid()
    )
    and exists (
      select 1 from public.stores s
      where s.id = routed_checkout_targets.target_store_id
        and s.user_id = auth.uid()
    )
  );

-- Backfill: toda rota que ja existe vira uma rota de um destino so, com o
-- mapa que ela ja tinha. Idempotente pelo unique (route_id, target_store_id).
insert into public.routed_checkout_targets
  (route_id, target_store_id, weight, enabled, sku_map, variant_map, settings, position, last_healed_at)
select
  c.id,
  c.target_store_id,
  1,
  true,
  c.sku_map,
  c.variant_map,
  c.settings,
  0,
  c.last_healed_at
from public.routed_checkout_configs c
on conflict (route_id, target_store_id) do nothing;

-- Como o rodizio escolhe entre os destinos elegiveis:
--   sticky        (padrao) -- o mesmo comprador cai sempre na mesma loja de
--                            checkout. Sorteio ancorado numa chave guardada no
--                            navegador dele. Quem abandona o carrinho e volta
--                            reencontra o mesmo checkout.
--   each_checkout          -- sorteia a cada clique em finalizar.
alter table public.routed_checkout_configs
  add column if not exists rotation jsonb not null default '{"strategy":"sticky"}'::jsonb;

comment on column public.routed_checkout_configs.rotation is
  'Rodizio entre os destinos: {"strategy":"sticky"|"each_checkout"}.';

comment on column public.routed_checkout_configs.target_store_id is
  'Destino primario (legado + resumo). Os destinos reais do rodizio estao em routed_checkout_targets.';

-- Telemetria de fallback passa a dizer QUAL destino falhou -- com rodizio,
-- "a rota falhou" nao localiza mais o problema.
alter table public.routed_checkout_fallbacks
  add column if not exists target_id uuid references public.routed_checkout_targets(id) on delete set null;

create index if not exists routed_checkout_fallbacks_target_idx
  on public.routed_checkout_fallbacks (target_id, created_at desc);
