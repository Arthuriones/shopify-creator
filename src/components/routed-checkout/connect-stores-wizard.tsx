"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Languages,
  Loader2,
  PackageCheck,
  Route as RouteIcon,
  Store,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
}

interface ImageQueueProgress {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface DestinationResult {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  imageQueueCount: number;
  skuMap: Record<string, string>;
  variantMap: Record<string, string>;
}

interface ConnectStoresWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: StoreOption[];
  appOrigin: string;
  onRouteCreated?: () => void;
}

function storeLabel(store?: StoreOption) {
  if (!store) return "—";
  return store.name || store.shop_domain;
}

const STEPS = ["Lojas", "Criar destino", "Ativar rota"];

export function ConnectStoresWizard({
  open,
  onOpenChange,
  stores,
  appOrigin,
  onRouteCreated,
}: ConnectStoresWizardProps) {
  const [step, setStep] = useState(1);

  // "generate" = neutraliza da vitrine. "reuse" = copia uma dark store ja
  // neutralizada e conecta por SKU (sem gerar IA de novo).
  const [wizardMode, setWizardMode] = useState<"generate" | "reuse">("generate");
  const [reuseFromStoreId, setReuseFromStoreId] = useState("");
  const [reuseMatched, setReuseMatched] = useState<number | null>(null);

  // Passo 1
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [neutralize, setNeutralize] = useState(true);
  const [imageQueue, setImageQueue] = useState(true);
  const [genericizeText, setGenericizeText] = useState(true);
  const [translate, setTranslate] = useState(false);
  const [translateVariants, setTranslateVariants] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [inventoryTracked, setInventoryTracked] = useState(false);
  const [inventoryQuantity, setInventoryQuantity] = useState("100");

  const [outputLanguage, setOutputLanguage] = useState("pt-BR");

  // Passo 2
  const [creatingDestination, setCreatingDestination] = useState(false);
  const [destinationResult, setDestinationResult] =
    useState<DestinationResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    processed: number;
    total: number;
    created: number;
    skipped: number;
    failed: number;
    canceled?: boolean;
  } | null>(null);
  const [imageProgress, setImageProgress] = useState<ImageQueueProgress | null>(
    null
  );
  const imagePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);

  // Passo 3
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeToken, setRouteToken] = useState("");
  const routeRequestedRef = useRef(false);

  const sourceStore = stores.find((store) => store.id === sourceStoreId);
  const targetStore = stores.find((store) => store.id === targetStoreId);

  function stopImagePoll() {
    if (imagePollRef.current) {
      clearTimeout(imagePollRef.current);
      imagePollRef.current = null;
    }
  }

  // Reseta tudo ao abrir e pre-seleciona vitrine/dark store.
  useEffect(() => {
    if (!open) {
      stopImagePoll();
      return;
    }
    setStep(1);
    setDestinationResult(null);
    setBatchProgress(null);
    setImageProgress(null);
    setRouteToken("");
    setRouteName("");
    setReuseMatched(null);
    routeRequestedRef.current = false;
    setSourceStoreId((current) => current || stores[0]?.id || "");
    setTargetStoreId((current) => current || stores[1]?.id || "");
    setReuseFromStoreId((current) => current || stores[1]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopImagePoll(), []);

  async function refreshImageQueue(storeId: string) {
    if (!storeId) return;
    stopImagePoll();
    try {
      const res = await fetch(
        `/api/jobs/neutralize-images?storeId=${encodeURIComponent(storeId)}`
      );
      const data = await res.json();
      if (!res.ok || !data.progress) return;
      const progress = data.progress as ImageQueueProgress;
      setImageProgress(progress.total > 0 ? progress : null);

      if (progress.pending > 0 || progress.processing > 0) {
        if (progress.pending > 0 && progress.processing === 0) {
          fetch("/api/jobs/neutralize-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId }),
          }).catch(() => {});
        }
        imagePollRef.current = setTimeout(
          () => refreshImageQueue(storeId),
          5000
        );
      }
    } catch {
      // silencioso
    }
  }

  async function handleCreateDestination() {
    if (!sourceStoreId || !targetStoreId) {
      toast.error("Escolha a vitrine e a dark store.");
      return;
    }
    if (sourceStoreId === targetStoreId) {
      toast.error("A dark store precisa ser diferente da vitrine.");
      return;
    }
    if (wizardMode === "reuse") {
      if (!reuseFromStoreId) {
        toast.error("Escolha a dark store que será copiada.");
        return;
      }
      if (
        reuseFromStoreId === targetStoreId ||
        reuseFromStoreId === sourceStoreId
      ) {
        toast.error("A dark store de origem precisa ser diferente das outras.");
        return;
      }
    }

    const controller = new AbortController();
    createAbortRef.current = controller;
    setCreatingDestination(true);
    setStep(2);
    setBatchProgress({ processed: 0, total: 0, created: 0, skipped: 0, failed: 0 });

    // Base do payload por modo. Reuse copia a dark store ja neutralizada (sem IA).
    const basePayload =
      wizardMode === "reuse"
        ? {
            sourceStoreId: reuseFromStoreId,
            targetStoreId,
            inventoryMode: inventoryTracked ? "tracked" : "not_tracked",
            inventoryQuantity: Number(inventoryQuantity) || 0,
            neutralizeProducts: false,
            translateProducts: false,
            translateVariantOptions: false,
          }
        : {
            sourceStoreId,
            targetStoreId,
            inventoryMode: inventoryTracked ? "tracked" : "not_tracked",
            inventoryQuantity: Number(inventoryQuantity) || 0,
            neutralizeProducts: neutralize,
            imageNeutralizeMode: imageQueue ? "queue" : "inline",
            aiMediaLimit: 1,
            genericizeText,
            neutralizationInstructions: instructions,
            translateProducts: translate,
            translateVariantOptions: translateVariants,
            targetLanguage: outputLanguage,
          };

    const agg = {
      created: 0,
      skipped: 0,
      failed: 0,
      imageQueueCount: 0,
      skuMap: {} as Record<string, string>,
      variantMap: {} as Record<string, string>,
    };
    let cursor: string | null = null;
    let total = 0;
    let first = true;
    let enqueuedImages = false;

    try {
      // Contagem rapida primeiro: a barra ja aparece com "0 de N" antes do
      // primeiro lote pesado de IA, deixando claro que esta funcionando.
      try {
        const countRes = await fetch(
          "/api/checkout-routes/create-destination",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ ...basePayload, countOnly: true }),
          }
        );
        const countData = (await countRes.json()) as {
          totalCount?: number | null;
        };
        if (countRes.ok && typeof countData.totalCount === "number") {
          total = countData.totalCount;
          first = false;
          setBatchProgress({
            processed: 0,
            total,
            created: 0,
            skipped: 0,
            failed: 0,
          });
        }
      } catch {
        // Sem contagem previa caimos no withCount do primeiro lote.
      }

      // Processa um lote por vez ate acabar, atualizando a barra de progresso.
      for (;;) {
        if (controller.signal.aborted) break;
        const res: Response = await fetch(
          "/api/checkout-routes/create-destination",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ ...basePayload, cursor, withCount: first }),
          }
        );
        const data = (await res.json()) as {
          error?: string;
          createdCount?: number;
          skippedCount?: number;
          failedCount?: number;
          imageQueueCount?: number;
          skuMap?: Record<string, string>;
          variantMap?: Record<string, string>;
          totalCount?: number | null;
          nextCursor?: string | null;
          hasMore?: boolean;
        };
        if (!res.ok) throw new Error(data.error || "Falha ao criar destino.");

        agg.created += data.createdCount || 0;
        agg.skipped += data.skippedCount || 0;
        agg.failed += data.failedCount || 0;
        agg.imageQueueCount += data.imageQueueCount || 0;
        Object.assign(agg.skuMap, data.skuMap || {});
        Object.assign(agg.variantMap, data.variantMap || {});
        if (first && typeof data.totalCount === "number") total = data.totalCount;
        first = false;
        if (data.imageQueueCount) enqueuedImages = true;

        const processed = agg.created + agg.skipped + agg.failed;
        setBatchProgress({
          processed,
          total,
          created: agg.created,
          skipped: agg.skipped,
          failed: agg.failed,
        });

        cursor = data.nextCursor || null;
        if (!data.hasMore) break;
      }

      const canceled = controller.signal.aborted;
      setBatchProgress((current) =>
        current ? { ...current, canceled } : current
      );
      setDestinationResult({
        createdCount: agg.created,
        skippedCount: agg.skipped,
        failedCount: agg.failed,
        imageQueueCount: agg.imageQueueCount,
        skuMap: agg.skuMap,
        variantMap: agg.variantMap,
      });
      if (enqueuedImages) refreshImageQueue(targetStoreId);
      if (canceled) {
        toast("Cancelado. Os produtos já criados foram mantidos.");
      } else {
        toast.success(
          `${agg.created} criados, ${agg.skipped} reaproveitados.`
        );
      }
    } catch (error) {
      const isAbort =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      if (isAbort) {
        setBatchProgress((current) =>
          current ? { ...current, canceled: true } : current
        );
        setDestinationResult({
          createdCount: agg.created,
          skippedCount: agg.skipped,
          failedCount: agg.failed,
          imageQueueCount: agg.imageQueueCount,
          skuMap: agg.skuMap,
          variantMap: agg.variantMap,
        });
        if (enqueuedImages) refreshImageQueue(targetStoreId);
        toast("Cancelado. Os produtos já criados foram mantidos.");
      } else {
        toast.error(
          error instanceof Error ? error.message : "Falha ao criar destino."
        );
        if (agg.created + agg.skipped === 0) setStep(1);
      }
    } finally {
      setCreatingDestination(false);
      createAbortRef.current = null;
    }
  }

  function cancelCreateDestination() {
    createAbortRef.current?.abort();
  }

  async function handleActivateRoute() {
    if (routeRequestedRef.current) return;
    routeRequestedRef.current = true;
    setCreatingRoute(true);
    setStep(3);

    const name =
      routeName.trim() ||
      `${storeLabel(sourceStore)} -> ${storeLabel(targetStore)}`;

    try {
      if (wizardMode === "reuse") {
        // Vitrine (C) e dark store (D) ja populadas: casa por SKU e cria rota.
        const res = await fetch("/api/checkout-routes/connect-by-sku", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, sourceStoreId, targetStoreId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao conectar por SKU.");
        if (!data.route?.public_token) {
          throw new Error(
            "Nenhuma variante casou por SKU. Confira se a vitrine já tem os produtos importados."
          );
        }
        setReuseMatched(data.matchedCount || 0);
        setRouteName(name);
        setRouteToken(data.route.public_token);
        onRouteCreated?.();
        toast.success(
          `${data.matchedCount || 0} variantes conectadas por SKU.`
        );
        return;
      }

      const res = await fetch("/api/checkout-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceStoreId,
          targetStoreId,
          mode: "enterprise_static",
          skuMap: destinationResult?.skuMap || {},
          variantMap: destinationResult?.variantMap || {},
          settings: { generatedBy: "connect_wizard" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar rota.");

      setRouteName(name);
      setRouteToken(data.config?.public_token || "");
      onRouteCreated?.();
      toast.success("Rota criada. Copie o script para a vitrine.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao criar rota."
      );
      routeRequestedRef.current = false;
      setStep(2);
    } finally {
      setCreatingRoute(false);
    }
  }

  const installSnippet = `<script
  src="${appOrigin}/routed-checkout-loader.js"
  data-token="${routeToken || "COLE_O_TOKEN_DA_ROTA"}"
  async>
</script>`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(installSnippet);
      toast.success("Script copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const imagesDone = imageProgress
    ? imageProgress.completed + imageProgress.failed
    : 0;
  const imagesPct = imageProgress
    ? Math.round((imagesDone / Math.max(imageProgress.total, 1)) * 100)
    : 0;
  const imagesRunning = imageProgress
    ? imageProgress.pending + imageProgress.processing > 0
    : false;

  const busy = creatingDestination || creatingRoute;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Nao deixa fechar no meio da criacao (Escape/clique fora): evita o
        // usuario perder a visao do progresso achando que travou.
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-primary" />
            Conectar vitrine à dark store
          </DialogTitle>
          <DialogDescription>
            Cria os produtos na dark store, conecta por SKU e gera o script de
            checkout roteado.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const active = step === number;
            const done = step > number;
            return (
              <div key={label} className="flex flex-1 items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done && "bg-primary/15 text-primary",
                    active && "bg-primary text-primary-foreground",
                    !active && !done && "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : number}
                </div>
                <span
                  className={cn(
                    "truncate text-xs",
                    active ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Passo 1 — Lojas e opções */}
        {step === 1 && (
          <div className="space-y-4">
            {stores.length < 2 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
                Conecte pelo menos duas lojas (uma vitrine e uma dark store).
              </div>
            )}

            {/* Como montar a dark store */}
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setWizardMode("generate")}
                className={cn(
                  "rounded-md px-2 py-1.5 font-semibold transition-colors",
                  wizardMode === "generate"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Gerar neutralizando
              </button>
              <button
                type="button"
                onClick={() => setWizardMode("reuse")}
                className={cn(
                  "rounded-md px-2 py-1.5 font-semibold transition-colors",
                  wizardMode === "reuse"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Reaproveitar dark store
              </button>
            </div>
            {wizardMode === "reuse" && (
              <p className="-mt-2 text-[11px] leading-4 text-muted-foreground">
                Copia uma dark store já neutralizada para a nova (sem gerar
                imagem de novo) e conecta a vitrine por SKU. Importe os produtos
                na vitrine antes de conectar.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5" /> Vitrine
                </Label>
                <Select
                  value={sourceStoreId}
                  onValueChange={(value) => setSourceStoreId(value || "")}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {storeLabel(store)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Onde o cliente compra.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <PackageCheck className="h-3.5 w-3.5" /> Dark store
                </Label>
                <Select
                  value={targetStoreId}
                  onValueChange={(value) => setTargetStoreId(value || "")}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {storeLabel(store)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Recebe os produtos e o checkout.
                </p>
              </div>
            </div>

            {wizardMode === "reuse" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <PackageCheck className="h-3.5 w-3.5" /> Copiar produtos de
                  (dark store já neutralizada)
                </Label>
                <Select
                  value={reuseFromStoreId}
                  onValueChange={(value) => setReuseFromStoreId(value || "")}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {storeLabel(store)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  A nova dark store recebe uma cópia dela (texto + imagens), sem
                  rodar IA.
                </p>
              </div>
            )}

            {wizardMode === "generate" && (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={neutralize}
                  onChange={(event) => setNeutralize(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <WandSparkles className="h-3.5 w-3.5 text-primary" />
                    Neutralizar produtos (stock/sem marca)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Remove marcas do texto e da imagem. Ideal para réplicas.
                  </span>
                </span>
              </label>

              {neutralize && (
                <div className="ml-6 space-y-2 border-l border-border/60 pl-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={imageQueue}
                      onChange={(event) => setImageQueue(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">
                        Imagens em background (fila)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Recomendado p/ lojas grandes. 1 imagem/produto, troca aos
                        poucos (~US$0,04 cada).
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={genericizeText}
                      onChange={(event) =>
                        setGenericizeText(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      Genericizar nome/descrição (ex.: Air Jordan → Tênis
                      esportivo).
                    </span>
                  </label>
                  <Textarea
                    rows={2}
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Instruções extras (opcional). Ex.: manter escudo do time, remover só selo de vendedor."
                    className="bg-background/70 text-xs"
                  />
                </div>
              )}

              <label className="flex items-start gap-2 border-t border-border/60 pt-2 text-sm">
                <input
                  type="checkbox"
                  checked={translate}
                  onChange={(event) => setTranslate(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-xs text-muted-foreground">
                  Traduzir textos para o idioma da dark store
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={translateVariants}
                  onChange={(event) =>
                    setTranslateVariants(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-xs text-muted-foreground">
                  Traduzir cores e tamanhos (variantes) para português
                </span>
              </label>
            </div>
            )}

            {wizardMode === "generate" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Languages className="h-3.5 w-3.5" /> Idioma dos produtos
                </Label>
                <Select
                  value={outputLanguage}
                  onValueChange={(value) => setOutputLanguage(value || "pt-BR")}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                    <SelectItem value="es-CL">Espanhol (Chile)</SelectItem>
                    <SelectItem value="es-MX">Espanhol (México)</SelectItem>
                    <SelectItem value="en">Inglês</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Título, descrição, tags e SEO saem nesse idioma.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inventoryTracked}
                  onChange={(event) =>
                    setInventoryTracked(event.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-xs text-muted-foreground">
                  Controlar estoque
                </span>
              </label>
              {inventoryTracked && (
                <Input
                  type="number"
                  min={0}
                  value={inventoryQuantity}
                  onChange={(event) => setInventoryQuantity(event.target.value)}
                  className="h-8 w-24 text-sm"
                />
              )}
            </div>

            <Button
              className="w-full"
              disabled={
                stores.length < 2 ||
                !sourceStoreId ||
                !targetStoreId ||
                sourceStoreId === targetStoreId ||
                (wizardMode === "reuse" &&
                  (!reuseFromStoreId ||
                    reuseFromStoreId === targetStoreId ||
                    reuseFromStoreId === sourceStoreId))
              }
              onClick={handleCreateDestination}
            >
              {wizardMode === "reuse"
                ? "Copiar para a dark store"
                : "Criar destino na dark store"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Passo 2 — Criar destino / progresso */}
        {step === 2 && (
          <div className="space-y-4">
            {creatingDestination && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/45 p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {wizardMode === "reuse"
                        ? "Copiando produtos para a dark store…"
                        : "Criando produtos na dark store…"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {batchProgress && batchProgress.total > 0
                        ? `${batchProgress.processed} de ${batchProgress.total} processados`
                        : batchProgress && batchProgress.processed > 0
                          ? `${batchProgress.processed} processados…`
                          : "Contando os produtos da origem…"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={cancelCreateDestination}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                </div>

                {batchProgress && batchProgress.total > 0 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((batchProgress.processed / Math.max(batchProgress.total, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                )}

                {batchProgress && (batchProgress.created > 0 || batchProgress.failed > 0) && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {batchProgress.created} criados
                    </span>
                    {batchProgress.skipped > 0 && (
                      <span>{batchProgress.skipped} reaproveitados</span>
                    )}
                    {batchProgress.failed > 0 && (
                      <span className="text-destructive">
                        {batchProgress.failed} falhas
                      </span>
                    )}
                  </div>
                )}

                <p className="text-[11px] leading-4 text-muted-foreground">
                  Mantenha esta janela aberta até terminar. Lojas grandes podem
                  levar alguns minutos — a barra avança a cada lote. Você pode
                  cancelar a qualquer momento; os produtos já criados ficam
                  salvos.
                </p>
              </div>
            )}

            {destinationResult && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border/60 bg-background/45 p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      {destinationResult.createdCount}
                    </p>
                    <p className="text-[11px] text-muted-foreground">criados</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/45 p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      {destinationResult.skippedCount}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      reaproveitados
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/45 p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      {Object.keys(destinationResult.variantMap).length}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      conexões
                    </p>
                  </div>
                </div>

                {destinationResult.failedCount > 0 && (
                  <p className="text-xs text-destructive">
                    {destinationResult.failedCount} produto(s) falharam.
                  </p>
                )}

                {imageProgress && imageProgress.total > 0 && (
                  <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Imagens neutralizadas: {imageProgress.completed}/
                        {imageProgress.total}
                        {imageProgress.failed > 0
                          ? ` · ${imageProgress.failed} falharam`
                          : ""}
                      </span>
                      <span>{imagesRunning ? "processando…" : "concluído"}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${imagesPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pode continuar — as imagens terminam em background.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    Voltar
                  </Button>
                  <Button className="flex-1" onClick={handleActivateRoute}>
                    Ativar rota
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Passo 3 — Ativar rota e script */}
        {step === 3 && (
          <div className="space-y-4">
            {creatingRoute && (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/45 p-4 text-sm">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium text-foreground">Criando rota…</p>
              </div>
            )}

            {routeToken && (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-foreground">
                    Rota <span className="font-semibold">{routeName}</span> criada
                  </span>
                  <Badge variant="secondary" className="ml-auto rounded-md">
                    {wizardMode === "reuse"
                      ? reuseMatched ?? 0
                      : Object.keys(destinationResult?.variantMap || {}).length}{" "}
                    conexões
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      Cole na vitrine (antes de &lt;/body&gt; em theme.liquid)
                    </Label>
                    <Button variant="ghost" size="sm" onClick={copySnippet}>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={installSnippet}
                    className="min-h-28 resize-y font-mono text-xs leading-6"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>

                {imageProgress && imageProgress.total > 0 && imagesRunning && (
                  <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Imagens: {imageProgress.completed}/{imageProgress.total}
                      </span>
                      <span>processando…</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${imagesPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button className="w-full" onClick={() => onOpenChange(false)}>
                  Concluir
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
