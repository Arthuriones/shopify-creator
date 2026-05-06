"use client";

import { useEffect, useMemo, useState } from "react";
import { Languages, Loader2, PlayCircle, RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
}

interface BulkJob {
  id: string;
  store_id: string;
  type: "bulk_import";
  status: "pending" | "processing" | "completed" | "failed";
  progress: {
    source?: string;
    step?: string;
    current?: number;
    total?: number;
    product?: { title?: string; price?: string };
  };
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

type InventoryMode = "not_tracked" | "tracked";

export default function BulkImportPage() {
  const [sources, setSources] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [optimize, setOptimize] = useState(false);
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [perSourceLimit, setPerSourceLimit] = useState("1");
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("not_tracked");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");

  const hasRunningJobs = useMemo(
    () => jobs.some((job) => job.status === "pending" || job.status === "processing"),
    [jobs]
  );

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Nao foi possivel carregar lojas.");
      }

      const loadedStores = data || [];
      setStores(loadedStores);
      if (loadedStores[0]) setSelectedStore(loadedStores[0].id);
      setLoadingStores(false);
    }

    void loadStores();
  }, []);

  async function loadJobs(opts?: { silent?: boolean }) {
    if (!selectedStore) {
      setJobs([]);
      return;
    }

    if (!opts?.silent) setJobsLoading(true);
    try {
      const params = new URLSearchParams({ storeId: selectedStore });
      const res = await fetch(`/api/jobs/bulk-import?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar jobs.");
      setJobs(data.jobs || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar jobs.");
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore]);

  useEffect(() => {
    if (!hasRunningJobs) return;
    const interval = setInterval(() => {
      void loadJobs({ silent: true });
    }, 2500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunningJobs, selectedStore]);

  async function handleStartBulk() {
    if (!selectedStore) {
      toast.error("Selecione uma loja.");
      return;
    }

    const sourceList = sources
      .split("\n")
      .map((source) => source.trim())
      .filter(Boolean);

    if (sourceList.length === 0) {
      toast.error("Insira pelo menos uma URL ou dominio.");
      return;
    }
    if (sourceList.length > 20) {
      toast.error("Maximo de 20 origens por vez.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          sources: sourceList,
          optimize,
          publishToStorefront,
          perSourceLimit: Number(perSourceLimit || 1),
          inventoryMode,
          inventoryQuantity: Number(inventoryQuantity || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao iniciar lote.");

      toast.success(`${data.queued || data.jobs?.length || sourceList.length} jobs enfileirados.`);
      setSources("");
      await loadJobs();
      void kickWorker();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar lote.");
    } finally {
      setSubmitting(false);
    }
  }

  async function kickWorker() {
    if (!selectedStore) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/jobs/bulk-import/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, limit: 5 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao processar fila.");
      await loadJobs({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar fila.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8 animate-fade-in">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Importação em lote
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Cole links AliExpress, domínios Shopify ou URLs de produto. O backend importa
          e publica com histórico em jobs; tradução por IA é opcional.
        </p>
      </header>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">Configuração</CardTitle>
          <CardDescription>Até 20 origens por execução.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Select value={selectedStore} onValueChange={(value) => setSelectedStore(value || "")}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione a loja de destino..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      <span className="inline-flex items-center gap-2">
                        <Store className="h-4 w-4 text-muted-foreground" />
                        {store.name} ({store.shop_domain})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Select value={perSourceLimit} onValueChange={(value) => setPerSourceLimit(value || "1")}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 produto/origem</SelectItem>
                  <SelectItem value="5">5 produtos/origem</SelectItem>
                  <SelectItem value="20">20 produtos/origem</SelectItem>
                  <SelectItem value="50">50 produtos/origem</SelectItem>
                  <SelectItem value="100">100 produtos/origem</SelectItem>
                  <SelectItem value="250">250 produtos/origem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-border/60 bg-background/45 p-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Estoque ao importar</p>
              <Select
                value={inventoryMode}
                onValueChange={(value) =>
                  setInventoryMode(value === "tracked" ? "tracked" : "not_tracked")
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_tracked">Inventory not tracked</SelectItem>
                  <SelectItem value="tracked">Definir estoque inicial</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Padrão recomendado: não rastreia estoque na Shopify e não envia quantidade zero.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quantidade</p>
              <Input
                type="number"
                min={0}
                value={inventoryQuantity}
                onChange={(event) => setInventoryQuantity(event.target.value)}
                disabled={inventoryMode === "not_tracked"}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Usado só quando o rastreio estiver ativo.
              </p>
            </div>
          </div>

          <Textarea
            placeholder="https://pt.aliexpress.com/item/123...&#10;exemplo.myshopify.com&#10;https://loja.com/products/produto"
            rows={10}
            value={sources}
            onChange={(event) => setSources(event.target.value)}
            className="font-mono text-sm"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={optimize}
                onChange={(event) => setOptimize(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Languages className="h-4 w-4 text-primary" />
              Traduzir produto
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={publishToStorefront}
                onChange={(event) => setPublishToStorefront(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Publicar na loja
            </label>
            <Button
              onClick={handleStartBulk}
              disabled={submitting || loadingStores || !selectedStore || !sources.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Iniciar lote
            </Button>
            <Button variant="outline" onClick={() => loadJobs()} disabled={jobsLoading}>
              {jobsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </Button>
            <Button variant="outline" onClick={kickWorker} disabled={processing || !selectedStore}>
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Processar pendentes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Fila de processamento
            {hasRunningJobs && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              Nenhum job ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-border/60 bg-background/45 p-3 md:flex-row md:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {job.progress?.product?.title || job.progress?.source || job.id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.error || job.progress?.step || "Aguardando"}
                      {job.progress?.total
                        ? ` · ${job.progress.current || job.progress.total}/${job.progress.total}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className="w-fit rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      background:
                        job.status === "completed"
                          ? "oklch(0.72 0.19 155 / 16%)"
                          : job.status === "failed"
                            ? "oklch(0.65 0.2 25 / 16%)"
                            : "oklch(0.7 0.13 250 / 16%)",
                      color:
                        job.status === "completed"
                          ? "oklch(0.72 0.19 155)"
                          : job.status === "failed"
                            ? "oklch(0.65 0.2 25)"
                            : "oklch(0.7 0.13 250)",
                    }}
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
