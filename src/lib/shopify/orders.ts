import { shopifyGraphQL, type ShopifyCredentials } from "@/lib/shopify/client";

export interface OrdersSummary {
  orders: number;
  /** Em centavos da moeda da loja, para nao somar float. */
  revenueCents: number;
  currency: string;
  /**
   * Por que a loja nao trouxe numeros. `null` = trouxe.
   *
   * "denied" e o caso comum e tem conserto do lado do usuario: a loja foi
   * conectada antes do app pedir read_orders e precisa ser reautorizada.
   */
  problem: "denied" | "failed" | null;
}

/**
 * A Shopify so libera os ultimos 60 dias com `read_orders`. Passar disso exige
 * `read_all_orders`, que e escopo protegido e depende de aprovacao dela.
 * Por isso o periodo mais longo da tela e 60 dias e nao 90: pedir 90 traria
 * um numero incompleto sem nenhum aviso de que esta incompleto.
 */
export const MAX_ORDER_DAYS = 60;

const QUERY = `query VendasDoPeriodo($busca: String!, $cursor: String) {
  orders(first: 250, query: $busca, after: $cursor, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      test
      cancelledAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}`;

interface No {
  id: string;
  test: boolean;
  cancelledAt: string | null;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
}

function ehNegado(erro: unknown) {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return /ACCESS_DENIED|access denied|read_orders|not approved/i.test(texto);
}

/**
 * Pedidos pagos de uma loja no periodo, somados.
 *
 * Conta o que virou dinheiro: pedido de teste e pedido cancelado ficam de
 * fora, e o valor e o `currentTotal` -- ja com reembolso e edicao aplicados,
 * ao contrario do total original.
 */
export async function getOrdersSummary(
  creds: ShopifyCredentials,
  desde: Date
): Promise<OrdersSummary> {
  const vazio: OrdersSummary = {
    orders: 0,
    revenueCents: 0,
    currency: "BRL",
    problem: null,
  };

  // financial_status:paid deixa fora o que ainda nao foi cobrado; sem isso o
  // faturamento contaria carrinho abandonado que virou pedido pendente.
  const busca = `created_at:>='${desde.toISOString()}' AND financial_status:paid`;

  try {
    let cursor: string | null = null;
    let pedidos = 0;
    let centavos = 0;
    let moeda = "";

    // Ate 20 paginas de 250 = 5000 pedidos no periodo. Acima disso a conta
    // fica truncada, mas a alternativa e prender a tela numa loja gigante.
    for (let pagina = 0; pagina < 20; pagina += 1) {
      const dados: {
        orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: No[] };
      } = await shopifyGraphQL(creds, QUERY, { busca, cursor });

      for (const no of dados.orders.nodes) {
        if (no.test || no.cancelledAt) continue;
        const dinheiro = no.currentTotalPriceSet?.shopMoney;
        if (!dinheiro) continue;
        pedidos += 1;
        centavos += Math.round(Number(dinheiro.amount || 0) * 100);
        if (!moeda) moeda = dinheiro.currencyCode;
      }

      if (!dados.orders.pageInfo.hasNextPage) break;
      cursor = dados.orders.pageInfo.endCursor;
    }

    return { orders: pedidos, revenueCents: centavos, currency: moeda || "BRL", problem: null };
  } catch (erro) {
    return { ...vazio, problem: ehNegado(erro) ? "denied" : "failed" };
  }
}
