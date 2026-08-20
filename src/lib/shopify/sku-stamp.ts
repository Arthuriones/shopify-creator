import { updateVariantSkus, type ShopifyCredentials } from "@/lib/shopify/client";

// ============================================================================
// Normalizacao de SKU da vitrine.
//
// O roteamento casa vitrine -> loja checkout exclusivamente por SKU. Quando o
// lojista cria um produto na mao no Shopify, o SKU vem vazio: aquele produto
// simplesmente nunca roteia, e o app so descobria isso depois, olhando o
// funil. Um usuario ficou com 27% de cobertura por causa disso.
//
// Em vez de exigir que ele preencha 483 SKUs na mao, o app carimba sozinho.
//
// Dois defeitos sao corrigidos aqui:
//  1. Variante sem SKU  -> nao roteia (cliente cai no checkout da vitrine).
//  2. SKU repetido em variantes diferentes -> roteia para o produto ERRADO
//     (o cliente paga por um item e recebe outro). Este e o pior dos dois.
//
// O SKU gerado e derivado do id numerico da variante, que e unico na loja:
// isso torna a operacao idempotente (rodar de novo nao gera SKU novo) e nao
// vaza marca nenhuma para a loja de checkout.
// ============================================================================

const PREFIXO = "xc";

function idNumerico(id: string | number): string {
  return String(id).match(/(\d+)$/)?.[1] || "";
}

// Os ids chegam como gid (API autenticada) ou como numero cru (products.json
// publico, usado pelo repair). As mutations so aceitam gid.
function paraGid(id: string | number, tipo: "Product" | "ProductVariant"): string {
  const texto = String(id);
  if (texto.startsWith("gid://")) return texto;
  const numero = idNumerico(texto);
  return numero ? `gid://shopify/${tipo}/${numero}` : "";
}

export function skuNeutro(variantId: string | number): string {
  const numero = idNumerico(variantId);
  if (!numero) return "";
  return `${PREFIXO}-${BigInt(numero).toString(36)}`;
}

interface ProdutoComVariantes {
  id: string | number;
  title: string;
  variants?:
    | { nodes?: { id: string | number; sku?: string | null }[] }
    | { id: string | number; sku?: string | null }[];
}

// products.json devolve variants como array; a API autenticada devolve
// { nodes: [...] }. Aceita os dois para nao duplicar esta logica nos callers.
function variantesDe(produto: ProdutoComVariantes) {
  const v = produto.variants;
  if (!v) return [];
  return Array.isArray(v) ? v : v.nodes || [];
}

export interface ResultadoCarimbo {
  /** Variantes que estavam sem SKU e ganharam um. */
  carimbadas: number;
  /** Variantes cujo SKU repetido foi trocado por um unico. */
  desduplicadas: number;
  /** SKUs que estavam repetidos, para mostrar no relatorio. */
  skusRepetidos: string[];
  /** variantId (gid) -> SKU final. Inclui as que ja tinham SKU valido. */
  skuPorVariante: Map<string, string>;
  falhas: string[];
}

/**
 * Garante que toda variante da loja tenha um SKU unico, escrevendo no Shopify
 * o que estiver faltando. Nao mexe em SKU que ja e unico.
 */
export async function normalizarSkus(
  creds: ShopifyCredentials,
  produtos: ProdutoComVariantes[]
): Promise<ResultadoCarimbo> {
  const skuPorVariante = new Map<string, string>();
  const falhas: string[] = [];
  const skusRepetidos = new Set<string>();

  // Primeira passada: decide o SKU final de cada variante sem tocar na API.
  // Quem aparece primeiro com um SKU fica com ele; os seguintes sao tratados
  // como duplicata e recebem um SKU proprio.
  const donoDoSku = new Map<string, string>();
  const aEscrever = new Map<string, { variantId: string; sku: string }[]>();
  let carimbadas = 0;
  let desduplicadas = 0;

  for (const produto of produtos) {
    const produtoGid = paraGid(produto.id, "Product");
    for (const bruta of variantesDe(produto)) {
      const varianteGid = paraGid(bruta.id, "ProductVariant");
      const variante = { id: varianteGid, sku: bruta.sku };
      const atual = variante.sku?.trim() || "";
      const chave = atual.toLowerCase();
      const jaUsado = chave ? donoDoSku.get(chave) : undefined;

      // SKU presente e ainda nao visto: esta bom, nao mexe.
      if (atual && !jaUsado) {
        donoDoSku.set(chave, variante.id);
        skuPorVariante.set(variante.id, atual);
        continue;
      }

      const novo = skuNeutro(variante.id);
      if (!novo || !produtoGid) {
        falhas.push(`${produto.title}: variante sem id numerico (${bruta.id})`);
        continue;
      }

      if (atual) {
        skusRepetidos.add(atual);
        desduplicadas += 1;
      } else {
        carimbadas += 1;
      }

      donoDoSku.set(novo.toLowerCase(), variante.id);
      skuPorVariante.set(variante.id, novo);
      const lista = aEscrever.get(produtoGid) || [];
      lista.push({ variantId: variante.id, sku: novo });
      aEscrever.set(produtoGid, lista);
    }
  }

  // Segunda passada: grava. Um productVariantsBulkUpdate por produto, em
  // serie — a API do Shopify e cobrada por custo e estoura em paralelo alto.
  for (const [productId, updates] of aEscrever) {
    try {
      await updateVariantSkus(creds, productId, updates);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : "erro desconhecido";
      falhas.push(`${productId}: ${msg}`);
      // Nao conseguiu gravar: o SKU planejado nao existe na loja, entao some
      // com ele do mapa para nao criar rota apontando para um SKU fantasma.
      for (const update of updates) skuPorVariante.delete(update.variantId);
    }
  }

  return {
    carimbadas,
    desduplicadas,
    skusRepetidos: [...skusRepetidos],
    skuPorVariante,
    falhas,
  };
}
