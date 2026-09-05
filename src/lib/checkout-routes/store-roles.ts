/**
 * Papel de cada loja no roteamento.
 *
 * O papel NAO e um campo da loja: e derivado das rotas. A mesma loja da
 * Shopify e "vitrine" porque alguma rota parte dela e "checkout" porque
 * alguma rota chega nela -- e pode ser as duas coisas. Guardar isso como
 * coluna criaria uma segunda verdade que sai do ar assim que uma rota muda.
 */
export type StoreRole = "vitrine" | "checkout" | "both" | "unassigned";

export interface RoleEdge {
  sourceStoreId: string;
  targetStoreIds: string[];
}

export function deriveStoreRoles(edges: RoleEdge[]): Map<string, StoreRole> {
  const sources = new Set<string>();
  const targets = new Set<string>();

  for (const edge of edges) {
    if (edge.sourceStoreId) sources.add(edge.sourceStoreId);
    for (const targetId of edge.targetStoreIds) {
      if (targetId) targets.add(targetId);
    }
  }

  const roles = new Map<string, StoreRole>();
  for (const id of new Set([...sources, ...targets])) {
    const isSource = sources.has(id);
    const isTarget = targets.has(id);
    roles.set(id, isSource && isTarget ? "both" : isSource ? "vitrine" : "checkout");
  }
  return roles;
}

export function roleOf(
  roles: Map<string, StoreRole>,
  storeId: string
): StoreRole {
  return roles.get(storeId) || "unassigned";
}
