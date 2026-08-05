// Geracao de SKU para produtos importados.
//
// O checkout roteado casa vitrine <-> loja checkout EXCLUSIVAMENTE por SKU
// (ver ARCHITECTURE.md §10) — a neutralizacao reescreve titulo e imagem, entao
// nao existe outra chave estavel. Varias origens nao trazem SKU: sites
// genericos quase nunca tem, e o Cartesian de variantes gera `sku: null`.
// Sem SKU o produto entra na loja e simplesmente nao roteia; ja aconteceu em
// producao (29 variantes ficaram fora do mapa de uma rota).
//
// Por isso, quando a origem nao fornece SKU, geramos um deterministico a partir
// do handle + posicao da variante: rodar o mesmo import duas vezes produz os
// mesmos SKUs, o que mantem a deduplicacao e o remapeamento da rota funcionando.

const MAX_HANDLE_PART = 40;

function slugifyHandle(handle: string) {
  return (
    handle
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_HANDLE_PART) || "ITEM"
  );
}

/**
 * Devolve o SKU da variante, gerando um estavel quando a origem nao tem.
 *
 * @param existingSku SKU vindo da origem (pode ser null/vazio)
 * @param productHandle handle do produto na origem
 * @param variantIndex posicao da variante (0-based)
 */
export function ensureVariantSku(
  existingSku: string | null | undefined,
  productHandle: string,
  variantIndex: number
): string {
  const trimmed = (existingSku || "").trim();
  if (trimmed) return trimmed;
  return `${slugifyHandle(productHandle)}-${String(variantIndex + 1).padStart(
    3,
    "0"
  )}`;
}
