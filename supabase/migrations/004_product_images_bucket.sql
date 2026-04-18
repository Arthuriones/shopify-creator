-- Bucket para imagens de produtos geradas com IA
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: usuarios autenticados podem fazer upload na pasta do seu user_id
CREATE POLICY "Users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Imagens publicas para leitura (Shopify precisa acessar)
CREATE POLICY "Anyone can read product images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');
