-- Indice para a fila de neutralizacao de imagem (polling por loja/tipo/status).
create index if not exists idx_background_jobs_store_type_status
  on public.background_jobs (store_id, type, status, created_at);
