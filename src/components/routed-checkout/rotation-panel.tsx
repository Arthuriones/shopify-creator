"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    label: "Fixo por comprador",
    hint: "Cada comprador cai sempre na mesma loja. Quem abandona o carrinho e volta reencontra o mesmo checkout.",
  },
  {
    value: "each_checkout",
    label: "Sorteia a cada checkout",
    hint: "Novo sorteio a cada clique em finalizar. Dilui mais rapido, mas o mesmo comprador pode ver dominios diferentes.",
  },
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
  /** Vitrine da rota: nunca pode virar destino dela mesma. */
  sourceStoreId?: string;
  /** Lojas do usuario, para escolher uma nova loja de checkout. */
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
        if (!cancelled) toast.error("Falha ao carregar as lojas de checkout.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Recalcula a fatia localmente enquanto o usuario mexe no peso: esperar o
  // servidor responder para so entao mostrar "37%" faz o controle parecer
  // travado.
  const shares = useMemo(() => {
    const total = targets
      .filter((target) => target.enabled && target.weight > 0)
      .reduce((sum, target) => sum + target.weight, 0);
    const map = new Map<string, number>();
    for (const target of targets) {
      map.set(
        target.id,
        target.enabled && target.weight > 0 && total > 0
          ? Math.round((target.weight / total) * 100)
          : 0
      );
    }
    return map;
  }, [targets]);

  const activeCount = targets.filter((t) => t.enabled && t.weight > 0).length;

  async function persist(
    payload: Record<string, unknown>,
    optimistic: () => void,
    rollback: () => void
  ) {
    optimistic();
    setSaving(true);
    try {
      const response = await fetch(`/api/checkout-routes/${routeId}/targets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      onChanged?.();
    } catch {
      rollback();
      toast.error("Nao consegui salvar. Nada foi alterado.");
    } finally {
      setSaving(false);
    }
  }

  function changeWeight(target: PanelTarget, delta: number) {
    const next = Math.max(0, Math.min(1000, target.weight + delta));
    if (next === target.weight) return;
    const before = targets;
    persist(
      { targets: [{ id: target.id, weight: next }] },
      () =>
        setTargets((current) =>
          current.map((item) => (item.id === target.id ? { ...item, weight: next } : item))
        ),
      () => setTargets(before)
    );
  }

  function toggleTarget(target: PanelTarget) {
    const before = targets;
    persist(
      { targets: [{ id: target.id, enabled: !target.enabled }] },
      () =>
        setTargets((current) =>
          current.map((item) =>
            item.id === target.id ? { ...item, enabled: !item.enabled } : item
          )
        ),
      () => setTargets(before)
    );
  }

  function changeStrategy(next: Strategy) {
    if (next === strategy) return;
    const before = strategy;
    persist(
      { rotation: { strategy: next } },
      () => setStrategy(next),
      () => setStrategy(before)
    );
  }

  async function removeTarget(target: PanelTarget) {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/checkout-routes/${routeId}/targets?targetId=${target.id}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Falha ao remover.");
        return;
      }
      setTargets((current) => current.filter((item) => item.id !== target.id));
      onChanged?.();
      toast.success(`${target.storeName || target.shopDomain} saiu do rodizio.`);
    } finally {
      setSaving(false);
    }
  }

  // Lojas que ainda podem entrar no rodizio: fora a vitrine (rotear para ela
  // mesma cairia no checkout que nao cobra) e as que ja sao destino.
  const addableStores = stores.filter(
    (store) =>
      store.id !== sourceStoreId &&
      !targets.some((target) => target.storeId === store.id)
  );

  async function addTarget() {
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
        toast.error(data.error || "Falha ao adicionar a loja de checkout.");
        return;
      }

      // Cobertura ruim entra com peso 0: fica configurada e visivel, mas nao
      // recebe comprador ate a pessoa revisar. Melhor do que mandar trafego
      // para um catalogo que casa pela metade.
      if (data.safeToEnable === false) {
        toast.warning(
          `Loja adicionada fora do rodizio: apenas ${data.coveragePercent}% das variantes casaram. Revise antes de dar peso a ela.`
        );
      } else {
        toast.success(
          `Loja adicionada ao rodizio com ${data.coveragePercent}% de cobertura.`
        );
      }

      setAddStoreId("");
      const refreshed = await fetch(`/api/checkout-routes/${routeId}/targets`);
      const next = await refreshed.json().catch(() => null);
      if (next?.targets) setTargets(next.targets);
      onChanged?.();
    } catch {
      toast.error("Falha ao adicionar a loja de checkout.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-6 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando lojas de checkout...
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">
          {routeName}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {activeCount <= 1
            ? "Todo o trafego desta vitrine vai para uma unica loja de checkout."
            : `O trafego desta vitrine e dividido entre ${activeCount} lojas de checkout.`}
        </p>
      </div>

      {activeCount > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Como sortear</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {STRATEGIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeStrategy(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  strategy === option.value
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card/40 hover:border-border/80"
                )}
              >
                <span className="text-xs font-semibold text-foreground">{option.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {targets.map((target) => {
          const share = shares.get(target.id) ?? 0;
          const paused = !target.enabled || target.weight === 0;
          return (
            <div
              key={target.id}
              className={cn(
                "rounded-lg border px-3 py-3 transition-colors",
                paused ? "border-border bg-muted/25" : "border-checkout/30 bg-checkout/6"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <CreditCard
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        paused ? "text-muted-foreground" : "text-checkout"
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{target.storeName || target.shopDomain}</span>
                  </p>
                  <p className="mt-0.5 truncate pl-5 text-[11px] text-muted-foreground">
                    {target.shopDomain}
                  </p>
                  <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">
                    {target.skuMapCount} SKUs mapeados
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md tabular-nums",
                      paused
                        ? "border-border text-muted-foreground"
                        : "border-checkout/40 text-checkout"
                    )}
                  >
                    {paused ? "pausada" : `${share}%`}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={saving || target.weight === 0}
                    onClick={() => changeWeight(target, -1)}
                    aria-label="Diminuir peso"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
                    peso {target.weight}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={saving}
                    onClick={() => changeWeight(target, 1)}
                    aria-label="Aumentar peso"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={saving}
                    onClick={() => toggleTarget(target)}
                  >
                    {target.enabled ? "Pausar" : "Reativar"}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={saving || targets.length <= 1}
                    onClick={() => removeTarget(target)}
                    aria-label="Remover do rodizio"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-xs leading-5 text-foreground">
            Nenhuma loja de checkout esta recebendo trafego. Com a rota ligada assim, o
            comprador cai no checkout da vitrine &mdash; que nao cobra. Reative uma loja ou
            desligue a rota.
          </p>
        </div>
      )}

      {sourceStoreId && addableStores.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed border-border/80 px-3 py-3">
          <p className="text-xs font-medium text-foreground">
            Adicionar loja de checkout
          </p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            A loja precisa ja ter o catalogo publicado. O xcart casa as variantes por
            SKU contra a vitrine, o que pode levar alguns minutos em catalogo grande.
          </p>
          <div className="flex gap-2">
            <Select
              value={addStoreId}
              onValueChange={(value) => setAddStoreId(value ?? "")}
              disabled={adding}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Escolher loja..." />
              </SelectTrigger>
              <SelectContent>
                {addableStores.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="text-xs">
                    {store.name || store.shopDomain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!addStoreId || adding}
              onClick={addTarget}
            >
              {adding ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Casando SKUs...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-4 text-muted-foreground">
        O peso e relativo, nao porcentagem: pesos 2, 1 e 1 dividem o trafego em 50%, 25%
        e 25%. Peso 0 mantem a loja configurada e fora do rodizio, para aquecer uma conta
        de pagamento nova antes de mandar volume.
      </p>
    </div>
  );
}
