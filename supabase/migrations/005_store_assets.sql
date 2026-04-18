-- Materiais visuais da marca (banners, referencias, etc.)
CREATE TABLE IF NOT EXISTS public.store_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_assets_store_id
  ON public.store_assets(store_id);

ALTER TABLE public.store_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage assets of their own stores"
  ON public.store_assets FOR ALL
  USING (
    store_id IN (
      SELECT id
      FROM public.stores
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT id
      FROM public.stores
      WHERE user_id = auth.uid()
    )
  );

-- Bucket para materiais da marca
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload store assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update store assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete store assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can read store assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'store-assets');
