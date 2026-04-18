-- Adicionar colunas de perfil da loja
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS niche text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS brand_voice text,
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS logo_path text;

-- Bucket para logos das lojas
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-logos', 'store-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: usuarios autenticados podem fazer upload na pasta do seu user_id
CREATE POLICY "Users can upload their own logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'store-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'store-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'store-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Logos publicos para leitura (usado na composicao de imagens)
CREATE POLICY "Anyone can read logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'store-logos');
