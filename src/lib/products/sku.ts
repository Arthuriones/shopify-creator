import { createHash } from "crypto";

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
// mesmos SKUs, o que mantem a deduplicacao e o remapeamento da rota
// funcionando.
//
// O SKU e um HASH do handle, nao o handle legivel. A versao anterior gerava
// "MEDICUBE-ZERO-PORE-PAD-001", o que levava o nome da marca para dentro da
// loja de checkout — justamente o que a neutralizacao existe para evitar. SKU
// aparece em confirmacao de pedido, nota e packing slip, e em alguns temas na
// propria pagina de checkout: era um vazamento direto entre as duas lojas.
//
// A deduplicacao do import nao e afetada: ela compara o SKU que veio da ORIGEM
// (e cai para o handle quando a origem nao tem SKU). Este gerador so decide o
// que e gravado no destino.

const PREFIXO = "xc";
const TAMANHO_HASH = 8;

function hashDoHandle(handle: string) {
  const base =
    handle
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  return createHash("sha1").update(base).digest("hex").slice(0, TAMANHO_HASH);
}

/**
 * Devolve o SKU da variante, gerando um estavel e sem marca quando a origem
 * nao tem.
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
  return `${PREFIXO}-${hashDoHandle(productHandle)}-${String(
    variantIndex + 1
  ).padStart(3, "0")}`;
}
