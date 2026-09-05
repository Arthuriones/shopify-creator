"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PanelTarget {
  id: string;
  storeId: string;
  storeName: string;
  shopDomain: string;
  weight: number;
  enabled: boolean;
  sharePercent: number;
  skuMapCount: number;
}

type Strategy = "sticky" | "each_checkout";

const STRATEGIES: { value: Strategy; label: string; hint: string }[] = [
  {
    value: "sticky",
    label: "Sempre a mesma loja",
    hint: "Quem abandona o carrinho e volta reencontra o mesmo checkout.",
  },
  {
    value: "each_checkout",
    label: "Sorteia toda vez",
    hint: "Divide mais rapido, mas o comprador pode ver dominios diferentes.",
  },
];

// Cores dos segmentos da barra. Sao os tons de checkout, variando o suficiente
// para distinguir lojas vizinhas sem virar arco-iris.
const FAIXAS = [
  "oklch(0.74 0.15 165)",
  "oklch(0.70 0.13 190)",
  "oklch(0.72 0.14 140)",
  "oklch(0.66 0.12 205)",
  "oklch(0.76 0.13 120)",
];

export function RotationPanel({
  routeId,
  routeName,
  sourceStoreId,
  stores = [],
  className,
  onChanged,
}: {
  routeId: string;
  routeName: string;
  sourceStoreId?: string;
  stores?: { id: string; name: string; shopDomain: string }[];
  className?: string;
  onChanged?: () => void;
}) {
  const [targets, setTargets] = useState<PanelTarget[]>([]);
  const [strategy, setStrategy] = useState<Strategy>("sticky");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addStoreId, setAddStoreId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/checkout-routes/${routeId}/targets`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setTargets(data.targets || []);
        setStrategy(data.rotation?.strategy === "each_checkout" ? "each_checkout" : "sticky");
      })
      .catch(() => {
        if (!cancelled) toast.error("Nao consegui carregar as lojas de checkout.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // A porcentagem E o peso. Peso e relativo, entao guardar 43/29/28 devolve
  // exatamente 43%/29%/28% -- o usuario nunca precisa saber que existe peso.
  const ativos = targets.filter((t) => t.enabled && t.weight > 0);
  const total = ativos.reduce((soma, t) => soma + t.weight, 0);
  const fatia = (t: PanelTarget) =>
    t.enabled && t.weight > 0 && total > 0 ? Math.round((t.weight / total) * 100) : 0;

  async function salvar(pesos: { id: string; weight: number; enabled?: boolean }[]) {
    setSaving(true);
    try {
      const response = await fetch(`/api/checkout-routes/${routeId}/targets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: pesos }),
      });
      if (!response.ok) throw new Error();
      onChanged?.();
    } catch {
      toast.error("Nao consegui salvar. Recarregue a pagina.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Mexer numa loja redistribui o resto entre as outras, proporcionalmente ao
   * que cada uma ja tinha. Sem isso o usuario teria que fazer a conta na mao
   * para os numeros somarem 100 -- e a soma nunca fecharia.
   */
  function ajustar(alvo: PanelTarget, novoPercentual: number) {
    const valor = Math.max(0, Math.min(100, Math.round(novoPercentual)));
    const outros = targets.filter((t) => t.id !== alvo.id && t.enabled);
    const somaOutros = outros.reduce((soma, t) => soma + t.weight, 0);
    const sobra = 100 - valor;

    const proximo = targets.map((t) => {
      if (t.id === alvo.id) return { ...t, weight: valor };
      if (!t.enabled) return t;
      if (outros.length === 0) return t;
      const parte =
        somaOutros > 0
          ? Math.round((t.weight / somaOutros) * sobra)
          : Math.round(sobra / outros.length);
      return { ...t, weight: Math.max(0, parte) };
    });

    setTargets(proximo);
    salvar(
      proximo
        .filter((t) => t.enabled)
        .map((t) => ({ id: t.id, weight: t.weight }))
    );
  }

  function dividirIgual() {
    const habilitados = targets.filter((t) => t.enabled);
    if (habilitados.length === 0) return;
    const base = Math.floor(100 / habilitados.length);
    const resto = 100 - base * habilitados.length;
    let i = 0;
    const proximo = targets.map((t) => {
      if (!t.enabled) return t;
      const valor = base + (i < resto ? 1 : 0);
      i += 1;
      return { ...t, weight: valor };
    });
    setTargets(proximo);
    salvar(proximo.filter((t) => t.enabled).map((t) => ({ id: t.id, weight: t.weight })));
  }

  function alternar(alvo: PanelTarget) {
    const proximo = targets.map((t) =>
      t.id === alvo.id ? { ...t, enabled: !t.enabled } : t
    );
    setTargets(proximo);
    salvar([{ id: alvo.id, weight: alvo.weight, enabled: !alvo.enabled }]);
  }

  async function mudarEstrategia(proxima: Strategy) {
    if (proxima === strategy) return;
    const anterior = strategy;
    setStrategy(proxima);
    setSaving(true);
    try {
      const response = await fetch(`/api/checkout-routes/${routeId}/targets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation: { strategy: proxima } }),
      });
      if (!response.ok) throw new Error();
      onChanged?.();
    } catch {
      setStrategy(anterior);
      toast.error("Nao consegui salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remover(alvo: PanelTarget) {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/checkout-routes/${routeId}/targets?targetId=${alvo.id}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Nao consegui remover.");
        return;
      }
      setTargets((atual) => atual.filter((t) => t.id !== alvo.id));
      onChanged?.();
      toast.success(`${alvo.storeName || alvo.shopDomain} saiu da divisao.`);
    } finally {
      setSaving(false);
    }
  }

  const disponiveis = stores.filter(
    (store) =>
      store.id !== sourceStoreId && !targets.some((t) => t.storeId === store.id)
  );

  async function adicionar() {
    if (!addStoreId || !sourceStoreId) return;
    setAdding(true);
    try {
      const response = await fetch("/api/checkout-routes/connect-by-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId,
          sourceStoreId,
          targetStoreId: addStoreId,
          createRoute: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Nao consegui adicionar a loja.");
        return;
      }
      if (data.safeToEnable === false) {
        toast.warning(
          `Loja adicionada com 0% do trafego: so ${data.coveragePercent}% dos produtos casaram. Revise antes de mandar comprador.`
        );
      } else {
        toast.success(`Loja adicionada. ${data.coveragePercent}% dos produtos casaram.`);
      }
      setAddStoreId("");
      const atualizado = await fetch(`/api/checkout-routes/${routeId}/targets`);
      const proximo = await atualizado.json().catch(() => null);
      if (proximo?.targets) setTargets(proximo.targets);
      onChanged?.();
    } catch {
      toast.error("Nao consegui adicionar a loja.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-6 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando lojas de checkout
      </div>
    );
  }

  const varias = targets.length > 1;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {varias ? "Divisao do trafego" : "Loja de checkout"}
        </h3>
        {varias && (
          <button
            type="button"
            onClick={dividirIgual}
            disabled={saving}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            Dividir igual
          </button>
        )}
      </div>

      {/* A barra e a resposta visual: quanto de cada cor, tanto de comprador.
          Um numero por linha nao mostra a proporcao entre as lojas. */}
      {varias && ativos.length > 0 && (
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {targets.map((alvo, indice) => {
            const percentual = fatia(alvo);
            if (percentual === 0) return null;
            return (
              <span
                key={alvo.id}
                title={`${alvo.storeName || alvo.shopDomain}: ${percentual}%`}
                style={{
                  width: `${percentual}%`,
                  background: FAIXAS[indice % FAIXAS.length],
                }}
              />
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {targets.map((alvo, indice) => {
          const percentual = fatia(alvo);
          const parada = !alvo.enabled || alvo.weight === 0;
          return (
            <div
              key={alvo.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                parada ? "border-border bg-muted/20" : "border-border/70"
              )}
            >
              <span
                className="h-6 w-1 shrink-0 rounded-full"
                style={{
                  background: parada
                    ? "var(--muted-foreground)"
                    : FAIXAS[indice % FAIXAS.length],
                  opacity: parada ? 0.4 : 1,
                }}
                aria-hidden
              />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <CreditCard
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      parada ? "text-muted-foreground" : "text-checkout"
                    )}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {alvo.storeName || alvo.shopDomain}
                  </span>
                </span>
                <span className="mt-0.5 block truncate pl-5 text-[11px] text-muted-foreground">
                  {alvo.skuMapCount} produtos ligados
                </span>
              </span>

              {varias && (
                <span className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={parada ? 0 : percentual}
                    disabled={parada || saving}
                    onChange={(event) => ajustar(alvo, Number(event.target.value))}
                    className="h-8 w-16 text-right tabular-nums"
                    aria-label={`Porcentagem do trafego para ${alvo.storeName || alvo.shopDomain}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </span>
              )}

              <span className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={saving}
                  onClick={() => alternar(alvo)}
                >
                  {alvo.enabled ? "Parar" : "Voltar"}
                </Button>
                {varias && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={saving}
                    onClick={() => remover(alvo)}
                    aria-label="Remover da divisao"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {ativos.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-xs leading-5 text-foreground">
            Nenhuma loja esta recebendo comprador. Com a rota ligada assim, o cliente cai
            no checkout da vitrine, que nao cobra.
          </p>
        </div>
      )}

      {varias && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            Quando um comprador volta
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {STRATEGIES.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                onClick={() => mudarEstrategia(opcao.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  strategy === opcao.value
                    ? "border-foreground/25 bg-foreground/8"
                    : "border-border/70 hover:border-border"
                )}
              >
                <span className="text-xs font-semibold text-foreground">{opcao.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {opcao.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sourceStoreId && disponiveis.length > 0 && (
        <div className="flex gap-2 border-t border-border/60 pt-4">
          <Select
            value={addStoreId}
            onValueChange={(valor) => setAddStoreId(valor ?? "")}
            disabled={adding}
          >
            <SelectTrigger className="h-9 flex-1 text-xs">
              <SelectValue placeholder="Adicionar outra loja de checkout" />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((store) => (
                <SelectItem key={store.id} value={store.id} className="text-xs">
                  {store.name || store.shopDomain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={!addStoreId || adding}
            onClick={adicionar}
          >
            {adding ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Ligando produtos
              </>
            ) : (
              "Adicionar"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
