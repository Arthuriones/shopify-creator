"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Plus, RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RouteMap, type MapRoute, type MapStore } from "@/components/routed-checkout/route-map";
import { RouteInspector } from "@/components/routed-checkout/route-inspector";

interface Graph {
  stores: MapStore[];
  routes: (MapRoute & {
    publicToken: string;
    lastHeal: { at: string; ok: boolean; message?: string } | null;
  })[];
}

/**
 * Console de roteamento: uma tela so.
 *
 * Antes o mesmo trabalho estava espalhado por um wizard em dialogo de tres
 * passos, uma aba de "rotas e tokens" com o script sempre aberto, o mapa e a
 * pagina de lojas. Quem opera nao pensa em passos: pensa em "o dinheiro esta
 * passando?". Entao o quadro fica sempre visivel e tudo que se faz com uma
 * rota acontece no painel ao lado, sem trocar de tela.
 */
export function RoutingConsole({ onConnectStores }: { onConnectStores: () => void }) {
  const [graph, setGraph] = useState<Graph>({ stores: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/checkout-routes/map");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Graph;
      setGraph(data);
      setSelectedId((current) =>
        current && data.routes.some((route) => route.id === current)
          ? current
          : (data.routes[0]?.id ?? null)
      );
    } catch {
      toast.error("Nao consegui carregar as rotas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando o roteamento
      </div>
    );
  }

  return (
    <ConsoleView
      graph={graph}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onConnectStores={onConnectStores}
      onReload={load}
    />
  );
}

/**
 * O desenho do console, sem busca de dados. Separado para poder ser renderizado
 * com qualquer estado -- inclusive fora do app, na hora de revisar o design.
 */
export function ConsoleView({
  graph,
  selectedId,
  onSelect,
  onConnectStores,
  onReload,
}: {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConnectStores: () => void;
  onReload: () => void;
}) {
  const selected = graph.routes.find((route) => route.id === selectedId) ?? null;

  const storeOptions = graph.stores.map((store) => ({
    id: store.id,
    name: store.name,
    shopDomain: store.shopDomain,
  }));

  const vitrines = graph.stores.filter(
    (store) => store.role === "vitrine" || store.role === "both"
  ).length;
  const checkouts = graph.stores.filter(
    (store) => store.role === "checkout" || store.role === "both"
  ).length;
  const quebradas = graph.routes.filter(
    (route) => route.enabled && route.lastHeal && !route.lastHeal.ok
  ).length;

  // Estado vazio como convite, nao como aviso: quem chega aqui sem rota
  // precisa saber qual e o proximo passo, nao que algo esta faltando.
  if (graph.routes.length === 0) {
    const semLojas = graph.stores.length < 2;
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-vitrine/40 bg-vitrine/10">
            <Store className="h-5 w-5 text-vitrine" aria-hidden />
          </span>
          <span className="h-px w-10 bg-gradient-to-r from-vitrine to-checkout" />
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-checkout/40 bg-checkout/10">
            <CreditCard className="h-5 w-5 text-checkout" aria-hidden />
          </span>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-semibold text-foreground">
          Ligue a vitrine ao checkout
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A vitrine recebe o trafego do anuncio. A loja de checkout cobra. O xcart
          leva o carrinho de uma para a outra casando os SKUs.
        </p>
        {semLojas ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Voce precisa de duas lojas Shopify conectadas.{" "}
            <Link href="/stores" className="text-foreground underline underline-offset-4">
              Conectar uma loja
            </Link>
          </p>
        ) : (
          <Button size="lg" className="mt-6" onClick={onConnectStores}>
            Criar a primeira rota
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            Roteamento
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {vitrines === 1 ? "1 vitrine" : `${vitrines} vitrines`} mandando trafego para{" "}
            {checkouts === 1 ? "1 loja de checkout" : `${checkouts} lojas de checkout`}
            {quebradas > 0 && (
              <span className="text-destructive">
                {" "}
                &mdash; {quebradas === 1 ? "1 rota precisa" : `${quebradas} rotas precisam`} de
                atencao
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReload}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Atualizar
          </Button>
          <Button onClick={onConnectStores}>
            <Plus className="mr-2 h-4 w-4" />
            Nova rota
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <RouteMap
            stores={graph.stores}
            routes={graph.routes}
            selectedRouteId={selectedId}
            onSelectRoute={onSelect}
          />

          {graph.routes.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border/60 pt-4">
              {graph.routes.map((route) => {
                const active = route.id === selectedId;
                const alerta = route.enabled && route.lastHeal && !route.lastHeal.ok;
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => onSelect(route.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                      active
                        ? "border-foreground/25 bg-foreground/8 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {alerta && (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                    )}
                    {!route.enabled && (
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                    )}
                    {route.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]">
          {selected ? (
            <RouteInspector
              route={{
                id: selected.id,
                name: selected.name,
                enabled: selected.enabled,
                publicToken: selected.publicToken,
                sourceStoreId: selected.sourceStoreId,
                lastHeal: selected.lastHeal,
              }}
              stores={storeOptions}
              onChanged={onReload}
              onDeleted={onReload}
            />
          ) : (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Escolha uma rota no quadro.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
