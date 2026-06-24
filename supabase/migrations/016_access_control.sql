-- ============================================================================
-- Controle de acesso: por padrao um usuario NAO tem acesso ao app.
-- Tem acesso quem: e admin, OU esta no plano 'pro', OU foi liberado
-- manualmente pelo admin (access_granted = true).
-- A trava so e aplicada quando ACCESS_CONTROL_ENABLED=true no ambiente.
-- ============================================================================

alter table public.profiles
    add column if not exists access_granted boolean not null default false;

-- Observacao: os usuarios atuais ficam com access_granted=false. Antes de
-- ligar ACCESS_CONTROL_ENABLED, libere no painel admin quem deve ter acesso
-- (ou marque em massa via SQL se preferir manter os atuais).
