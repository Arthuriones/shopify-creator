"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MapStore {
  id: string;
  name: string;
  shopDomain: string;
  role: "vitrine" | "checkout" | "both" | "unassigned";
}

export interface MapTarget {
  id: string;
  storeId: string;
  weight: number;
  enabled: boolean;
  sharePercent: number;
  mappedSkuCount: number;
}

export interface MapRoute {
  id: string;
  name: string;
  enabled: boolean;
  sourceStoreId: string;
  rotationStrategy: "sticky" | "each_checkout";
  targets: MapTarget[];
}

// Geometria do desenho. Em px, no espaco do SVG -- o container rola na
// horizontal quando a tela e menor, entao a largura e fixa de proposito.
const NODE_W = 216;
const NODE_H = 62;
const ROW_GAP = 20;
const COL_GAP_MIN = 150;
const COL_GAP_MAX = 460;
const PAD_Y = 12;

interface Placed {
  store: MapStore;
  x: number;
  y: number;
}

interface Edge {
  key: string;
  routeId: string;
  targetId: string;
  from: Placed;
  to: Placed;
  path: string;
  labelX: number;
  labelY: number;
  sharePercent: number;
  active: boolean;
  routeEnabled: boolean;
  multi: boolean;
}

// Ponto da cubica de Bezier em t.
function pointAt(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number]
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// Onde o rotulo de fatia fica na curva.
//
// No meio (t=0.5) nao serve: as arestas que saem da MESMA vitrine ainda estao
// espremidas ali, e os rotulos empilham um por cima do outro. Perto do
// destino elas ja abriram em leque e cada rotulo herda o y do seu card.
const LABEL_T = 0.76;
// Quando varias arestas chegam no MESMO destino elas se sobrepoem perto dele,
// e os rotulos empilham. Espalhar o t de cada uma faz cada rotulo cair num
// ponto diferente da curva.
const LABEL_T_SPREAD = 0.13;

function bezier(from: Placed, to: Placed) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  // Controles na horizontal: a curva sai e entra reta nos cards, o que deixa
  // legivel qual aresta toca qual no mesmo quando varias se cruzam.
  const dx = Math.max(60, (x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return {
    path: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
    labelAt: (t: number) =>
      pointAt(t, [x1, y1], [c1x, y1], [c2x, y2], [x2, y2]),
  };
}

export function RouteMap({
  stores,
  routes,
  selectedRouteId,
  onSelectRoute,
  className,
}: {
  stores: MapStore[];
  routes: MapRoute[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  className?: string;
}) {
  const [hoverStoreId, setHoverStoreId] = useState<string | null>(null);

  // O quadro ocupa a largura que tiver. Com largura fixa sobrava vazio dos
  // dois lados numa tela grande, e as curvas ficavam mais apertadas do que
  // precisavam -- justo o que atrapalha seguir uma aresta com o olho.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [colGap, setColGap] = useState(COL_GAP_MIN + 20);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const livre = entry.contentRect.width - NODE_W * 2;
      setColGap(Math.max(COL_GAP_MIN, Math.min(COL_GAP_MAX, livre)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const canvasW = NODE_W * 2 + colGap;

  const { vitrines, checkouts, edges, height } = useMemo(() => {
    const byId = new Map(stores.map((store) => [store.id, store]));

    // So entram no mapa as lojas que participam de alguma rota. Loja solta
    // vira ruido: o mapa e sobre as conexoes, e a lista de lojas ja mostra
    // quem esta sem rota.
    const sourceIds: string[] = [];
    const targetIds: string[] = [];
    for (const route of routes) {
      if (byId.has(route.sourceStoreId) && !sourceIds.includes(route.sourceStoreId)) {
        sourceIds.push(route.sourceStoreId);
      }
      for (const target of route.targets) {
        if (byId.has(target.storeId) && !targetIds.includes(target.storeId)) {
          targetIds.push(target.storeId);
        }
      }
    }

    const step = NODE_H + ROW_GAP;
    const rows = Math.max(sourceIds.length, targetIds.length, 1);
    const canvasH = rows * step - ROW_GAP + PAD_Y * 2;

    // Cada coluna centralizada na vertical: com 1 vitrine e 5 checkouts, a
    // vitrine fica no meio, de frente para o leque.
    const place = (ids: string[], x: number): Placed[] => {
      const total = ids.length * step - ROW_GAP;
      const top = (canvasH - total) / 2;
      return ids.map((id, index) => ({
        store: byId.get(id)!,
        x,
        y: top + index * step,
      }));
    };

    const vitrineNodes = place(sourceIds, 0);
    const checkoutNodes = place(targetIds, NODE_W + colGap);
    const vitrineByStore = new Map(vitrineNodes.map((n) => [n.store.id, n]));
    const checkoutByStore = new Map(checkoutNodes.map((n) => [n.store.id, n]));

    interface RawEdge extends Omit<Edge, "labelX" | "labelY"> {
      labelAt: (t: number) => [number, number];
    }

    const raw: RawEdge[] = [];
    for (const route of routes) {
      const from = vitrineByStore.get(route.sourceStoreId);
      if (!from) continue;
      const multi = route.targets.length > 1;
      for (const target of route.targets) {
        const to = checkoutByStore.get(target.storeId);
        if (!to) continue;
        const geometry = bezier(from, to);
        raw.push({
          key: `${route.id}:${target.id}`,
          routeId: route.id,
          targetId: target.id,
          from,
          to,
          path: geometry.path,
          labelAt: geometry.labelAt,
          sharePercent: target.sharePercent,
          active: route.enabled && target.enabled && target.weight > 0,
          routeEnabled: route.enabled,
          multi,
        });
      }
    }

    // Espalha o rotulo de arestas que chegam no mesmo destino.
    const porDestino = new Map<string, RawEdge[]>();
    for (const edge of raw) {
      const list = porDestino.get(edge.to.store.id) || [];
      list.push(edge);
      porDestino.set(edge.to.store.id, list);
    }

    const drawn: Edge[] = [];
    for (const group of porDestino.values()) {
      group.forEach((edge, index) => {
        // Centrado em LABEL_T: com uma aresta so fica onde estava.
        const t =
          group.length === 1
            ? LABEL_T
            : LABEL_T - ((group.length - 1) / 2 - index) * LABEL_T_SPREAD;
        const [labelX, labelY] = edge.labelAt(Math.min(0.92, Math.max(0.4, t)));
        const { labelAt: _unused, ...rest } = edge;
        void _unused;
        drawn.push({ ...rest, labelX, labelY });
      });
    }

    return {
      vitrines: vitrineNodes,
      checkouts: checkoutNodes,
      edges: drawn,
      height: canvasH,
    };
  }, [stores, routes, colGap]);

  const focusedRouteIds = useMemo(() => {
    if (!hoverStoreId) return null;
    const ids = new Set<string>();
    for (const route of routes) {
      if (
        route.sourceStoreId === hoverStoreId ||
        route.targets.some((target) => target.storeId === hoverStoreId)
      ) {
        ids.add(route.id);
      }
    }
    return ids;
  }, [hoverStoreId, routes]);

  // So o hover apaga o resto. Escurecer pela SELECAO deixava metade do quadro
  // morto assim que a tela abria -- com uma rota sempre selecionada por
  // padrao, a outra vitrine parecia desligada sem estar.
  const isDimmed = (routeId: string) => {
    if (!focusedRouteIds) return false;
    return !focusedRouteIds.has(routeId);
  };

  const isSelected = (routeId: string) =>
    Boolean(selectedRouteId) && routeId === selectedRouteId;

  if (edges.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center",
          className
        )}
      >
        <p className="text-sm font-medium text-foreground">Nenhuma rota desenhada ainda</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          Conecte uma vitrine a pelo menos uma loja de checkout para o mapa aparecer aqui.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={cn("overflow-x-auto", className)}>
      <div
        className="relative mx-auto"
        style={{ width: canvasW, height, minWidth: NODE_W * 2 + COL_GAP_MIN }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${canvasW} ${height}`}
          aria-hidden
        >
          <defs>
            {edges.map((edge) => (
              <linearGradient
                key={edge.key}
                id={`edge-${edge.key.replace(/[^a-zA-Z0-9]/g, "")}`}
                gradientUnits="userSpaceOnUse"
                x1={edge.from.x + NODE_W}
                x2={edge.to.x}
              >
                <stop offset="0%" stopColor="var(--vitrine)" />
                <stop offset="100%" stopColor="var(--checkout)" />
              </linearGradient>
            ))}
          </defs>

          {edges.map((edge) => {
            const dimmed = isDimmed(edge.routeId);
            const gradientId = `edge-${edge.key.replace(/[^a-zA-Z0-9]/g, "")}`;
            // Espessura conta a fatia do trafego: a aresta mais grossa e por
            // onde a maior parte dos compradores passa.
            const width = edge.active
              ? 1.5 + (Math.max(0, Math.min(100, edge.sharePercent)) / 100) * 3.5
              : 1.5;
            return (
              <g
                key={edge.key}
                opacity={
                  dimmed ? 0.12 : isSelected(edge.routeId) ? 1 : edge.active ? 0.62 : 0.32
                }
              >
                {/* Linha base. Cheia = no rodizio; tracejada = destino
                    configurado mas sem receber trafego (peso 0, destino
                    desligado, ou rota inteira desligada). */}
                <path
                  d={edge.path}
                  fill="none"
                  stroke={edge.active ? `url(#${gradientId})` : "var(--muted-foreground)"}
                  strokeWidth={width}
                  strokeLinecap="round"
                  strokeDasharray={edge.active ? undefined : "5 5"}
                  className="transition-opacity duration-200"
                />
                {/* Pontinhos correndo por cima da linha cheia, vitrine ->
                    checkout. Mostram a direcao sem gastar uma seta, e sem
                    roubar o tracejado, que ja quer dizer "pausada". */}
                {edge.active && (
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="var(--background)"
                    strokeWidth={Math.max(1, width - 1)}
                    strokeLinecap="round"
                    className="route-edge-flow"
                    opacity={0.55}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Fatia do trafego, so quando ha mais de um destino: com um destino
            so, "100%" nao informa nada. */}
        {edges
          .filter((edge) => edge.multi)
          .map((edge) => (
            <div
              key={`label-${edge.key}`}
              className={cn(
                "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-opacity duration-200",
                edge.active
                  ? "border-checkout/40 bg-background text-checkout"
                  : "border-border bg-background text-muted-foreground"
              )}
              style={{
                left: edge.labelX,
                top: edge.labelY,
                opacity: isDimmed(edge.routeId) ? 0.15 : 1,
              }}
            >
              {edge.active ? `${edge.sharePercent}%` : "pausada"}
            </div>
          ))}

        {[...vitrines, ...checkouts].map((node) => {
          const isVitrine = node.x === 0;
          const routesOfNode = routes.filter((route) =>
            isVitrine
              ? route.sourceStoreId === node.store.id
              : route.targets.some((t) => t.storeId === node.store.id)
          );
          const dimmed =
            Boolean(focusedRouteIds) && routesOfNode.every((route) => isDimmed(route.id));
          const Icon = isVitrine ? Store : CreditCard;

          return (
            <button
              key={`${isVitrine ? "v" : "c"}-${node.store.id}`}
              type="button"
              onMouseEnter={() => setHoverStoreId(node.store.id)}
              onMouseLeave={() => setHoverStoreId(null)}
              onFocus={() => setHoverStoreId(node.store.id)}
              onBlur={() => setHoverStoreId(null)}
              onClick={() => {
                const first = routesOfNode[0];
                if (first && onSelectRoute) onSelectRoute(first.id);
              }}
              className={cn(
                "absolute flex flex-col justify-center gap-0.5 rounded-xl border px-3 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isVitrine
                  ? "border-vitrine/35 bg-vitrine/8 hover:border-vitrine/60"
                  : "border-checkout/35 bg-checkout/8 hover:border-checkout/60",
                dimmed && "opacity-25"
              )}
              style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
            >
              <span className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isVitrine ? "text-vitrine" : "text-checkout"
                  )}
                  aria-hidden
                />
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {node.store.name || node.store.shopDomain}
                </span>
              </span>
              <span className="truncate pl-5 text-[11px] text-muted-foreground">
                {node.store.shopDomain}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
