-- ============================================================================
-- CPF do cliente.
--
-- A Pagou exige buyer.document.number em cobranca Pix (422 DOCUMENT_REQUIRED
-- sem ele). Guardamos uma vez por usuario para nao pedir em toda recarga.
-- ============================================================================

alter table public.profiles
    add column if not exists document_number text,
    add column if not exists document_type text not null default 'CPF';

comment on column public.profiles.document_number is
    'CPF/CNPJ so com digitos. Obrigatorio para cobranca Pix na Pagou.';
comment on column public.profiles.document_type is
    'CPF ou CNPJ — a Pagou exige em CAIXA ALTA.';
