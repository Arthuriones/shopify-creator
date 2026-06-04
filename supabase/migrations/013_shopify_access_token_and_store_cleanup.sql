-- Reintroduz o token OAuth da Shopify como fallback para apps instalados via OAuth.
alter table public.stores
  add column if not exists access_token text;

-- Permite que jobs sejam removidos junto com a loja.
alter table public.background_jobs
  drop constraint if exists background_jobs_store_id_fkey;

alter table public.background_jobs
  add constraint background_jobs_store_id_fkey
  foreign key (store_id)
  references public.stores(id)
  on delete cascade;

drop policy if exists "Users can delete their own jobs" on public.background_jobs;

create policy "Users can delete their own jobs"
  on public.background_jobs for delete
  using (auth.uid() = user_id);
