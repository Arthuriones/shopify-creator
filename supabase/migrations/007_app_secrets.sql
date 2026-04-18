-- Segredos globais do app (uso interno do backend)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_app_secrets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_secrets_updated_at ON public.app_secrets;
CREATE TRIGGER trg_app_secrets_updated_at
  BEFORE UPDATE ON public.app_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_secrets_updated_at();

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to app_secrets" ON public.app_secrets;
CREATE POLICY "No direct access to app_secrets"
  ON public.app_secrets
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.app_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_secrets TO service_role;
