const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** URL publica do logo principal de uma loja no bucket store-logos. */
export function getLogoUrl(logoPath: string): string {
  return `${BASE}/storage/v1/object/public/store-logos/${logoPath}`;
}

/** URL publica de um material de marca no bucket store-assets. */
export function getAssetUrl(filePath: string): string {
  return `${BASE}/storage/v1/object/public/store-assets/${filePath}`;
}
