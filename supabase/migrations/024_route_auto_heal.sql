-- Auto-conserto das rotas de checkout.
--
-- O job /api/jobs/routes/heal roda de hora em hora e revisa as rotas ligadas,
-- comecando pelas que estao ha mais tempo sem revisao. Precisa saber quando
-- cada rota foi revisada pela ultima vez para fazer o rodizio; sem isso ele
-- reprocessaria sempre as mesmas primeiras rotas.
--
-- NULL = nunca revisada, e tem prioridade sobre qualquer outra.

alter table public.routed_checkout_configs
  add column if not exists last_healed_at timestamptz;

-- O job ordena por last_healed_at entre as rotas ligadas.
create index if not exists routed_checkout_configs_heal_idx
  on public.routed_checkout_configs (last_healed_at nulls first)
  where enabled;

comment on column public.routed_checkout_configs.last_healed_at is
  'Ultima vez que o auto-conserto revisou esta rota. NULL = nunca revisada.';
