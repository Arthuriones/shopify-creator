-- Trial de clonagem: cada conta nova pode clonar 1 loja de graca.
-- Depois disso, precisa assinar (Pro) ou ter acesso liberado pelo admin.
-- Guarda a loja usada na clonagem gratuita. NULL = trial ainda disponivel.
-- A mesma loja pode ser reclonada/paginada de graca (gate compara o store_id).
alter table public.profiles
  add column if not exists free_clone_store_id uuid;

comment on column public.profiles.free_clone_store_id is
  'Loja consumida na clonagem gratuita do trial. NULL = trial disponivel.';
