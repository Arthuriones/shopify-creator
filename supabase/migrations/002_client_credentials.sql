-- Migrar stores de access_token para client_id + client_secret
alter table public.stores add column if not exists client_id text;
alter table public.stores add column if not exists client_secret text;

-- Remover coluna antiga (tokens estáticos não existem mais)
alter table public.stores drop column if exists access_token;

-- Tornar obrigatórios
alter table public.stores alter column client_id set not null;
alter table public.stores alter column client_secret set not null;
