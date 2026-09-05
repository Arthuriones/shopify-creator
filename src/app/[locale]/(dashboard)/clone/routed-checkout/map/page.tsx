"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Loader2,
  Power,
  RefreshCw,
  Route as RouteIcon,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  RouteMap,
  type MapRoute,
  type MapStore,
} from "@/components/routed-checkout/route-map";
import { RotationPanel } from "@/components/routed-checkout/rotation-panel";
import { StoreRoleBadge } from "@/components/routed-checkout/store-role-badge";

interface GraphPayload {
  stores: MapStore[];
  routes: MapRoute[];
}

export default function RouteMapPage() {
  const [graph, setGraph] = useState<GraphPayload>({ stores: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/checkout-routes/map");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as GraphPayload;
      setGraph(data);
      setSelectedRouteId((current) =>
        current && data.routes.some((route) => route.id === current)
          ? current
          : (data.routes[0]?.id ?? null)
      );
    } catch {
      toast.error("Falha ao carregar o mapa de rotas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRoute = useMemo(
    () => graph.routes.find((route) => route.id === selectedRouteId) || null,
    [graph.routes, selectedRouteId]
  );

  const storesById = useMemo(
    () => new Map(graph.stores.map((store) => [store.id, store])),
    [graph.stores]
  );

  const unassigned = graph.stores.filter((store) => store.role === "unassigned");

  // Uma vitrine mandando tudo para uma loja so nao e erro, mas e o cenario
  // que o rodizio existe para resolver -- vale dizer isso onde a pessoa esta
  // olhando o desenho.
  const singleTargetRoutes = graph.routes.filter(
    (route) => route.enabled && route.targets.filter((t) => t.enabled && t.weight > 0).length === 1
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Mapa de rotas
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Quem manda trafego para quem. A{" "}
            <span className="font-medium text-vitrine">vitrine</span> recebe o anuncio e
            carrega a marca; a{" "}
            <span className="font-medium text-checkout">loja de checkout</span> e onde o
            pagamento acontece. A espessura da linha e a fatia do trafego que passa por ela.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Montando o mapa...
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-vitrine" aria-hidden />
                  Vitrine
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-checkout" aria-hidden />
                  Loja de checkout
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="26" height="8" aria-hidden>
                    <line x1="1" y1="4" x2="25" y2="4" stroke="var(--checkout)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  No rodizio
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="26" height="8" aria-hidden>
                    <line
                      x1="1"
                      y1="4"
                      x2="25"
                      y2="4"
                      stroke="var(--muted-foreground)"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                    />
                  </svg>
                  Configurada, sem trafego
                </span>
              </div>

              <RouteMap
                stores={graph.stores}
                routes={graph.routes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Rotas
                </p>
                {graph.routes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma rota criada ainda.{" "}
                    <Link
                      href="/clone/routed-checkout/create-route"
                      className="text-primary underline underline-offset-2"
                    >
                      Conectar duas lojas
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="space-y-2">
                    {graph.routes.map((route) => {
                      const source = storesById.get(route.sourceStoreId);
                      const active = route.targets.filter(
                        (target) => target.enabled && target.weight > 0
                      );
                      const isSelected = route.id === selectedRouteId;
                      return (
                        <button
                          key={route.id}
                          type="button"
                          onClick={() => setSelectedRouteId(route.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                            isSelected
                              ? "border-primary/60 bg-primary/8"
                              : "border-border bg-card/40 hover:border-border/80"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                              {route.name}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {!route.enabled && (
                                <Badge
                                  variant="outline"
                                  className="rounded-md border-border text-[10px] text-muted-foreground"
                                >
                                  <Power className="mr-1 h-3 w-3" />
                                  desligada
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="rounded-md border-checkout/40 text-[10px] text-checkout"
                              >
                                {active.length} loja(s) de checkout
                              </Badge>
                            </span>
                          </div>
                          <p className="mt-1 truncate pl-5 text-[11px] text-muted-foreground">
                            {source?.name || "vitrine removida"} &rarr;{" "}
                            {active
                              .map(
                                (target) =>
                                  storesById.get(target.storeId)?.name || "loja removida"
                              )
                              .join(", ") || "nenhuma no rodizio"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {singleTargetRoutes.length > 0 && (
                  <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                    {singleTargetRoutes.length === 1
                      ? "1 rota depende de uma unica loja de checkout."
                      : `${singleTargetRoutes.length} rotas dependem de uma unica loja de checkout.`}{" "}
                    Se essa conta cair, a vitrine para de vender. Adicionar uma segunda loja
                    ao rodizio dilui esse risco.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                {selectedRoute ? (
                  <RotationPanel
                    routeId={selectedRoute.id}
                    routeName={selectedRoute.name}
                    sourceStoreId={selectedRoute.sourceStoreId}
                    stores={graph.stores.map((store) => ({
                      id: store.id,
                      name: store.name,
                      shopDomain: store.shopDomain,
                    }))}
                    onChanged={load}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Escolha uma rota para ajustar o rodizio.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {unassigned.length > 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Lojas fora de qualquer rota
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassigned.map((store) => (
                    <span
                      key={store.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/40 px-2.5 py-1.5"
                    >
                      <span className="text-xs font-medium text-foreground">{store.name}</span>
                      <StoreRoleBadge role={store.role} />
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
