const FALLBACK_PUBLIC_APP_URL = "https://shopify-creator-chi.vercel.app";

function normalizeUrl(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isLocalUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      url.hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export function getPublicAppUrl(runtimeOrigin?: string | null) {
  const candidates = [
    normalizeUrl(runtimeOrigin),
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL),
  ];

  return (
    candidates.find((candidate) => candidate && !isLocalUrl(candidate)) ||
    FALLBACK_PUBLIC_APP_URL
  );
}
