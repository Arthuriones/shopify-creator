// Executa `worker` sobre `items` com no maximo `concurrency` chamadas em voo,
// preservando a ordem dos resultados.
//
// Extraido de api/shopify/products/enrich-taxonomy para poder ser reusado —
// varios pontos do app faziam laços sequenciais de rede (o pior deles era o
// attach de colecoes no preview do clone, que chegava a ~1000 requisicoes em
// serie dentro de uma rota com maxDuration de 120s).
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
