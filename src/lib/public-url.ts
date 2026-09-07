// Espelha o NEXT_PUBLIC_APP_URL de producao. E o host do app (user.), nao o
// dominio raiz: xcart.app e o site de marketing, e o middleware redireciona
// tudo que nao seja pagina publica de la para ca.
//
// So vale quando a variavel de ambiente falta. Ficou apontando para um
// endereco antigo da Vercel por muito tempo -- se o fallback fosse usado, o
// script instalado no tema do lojista buscaria o loader no lugar errado.
const FALLBACK_PUBLIC_APP_URL = "https://user.xcart.app";

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
