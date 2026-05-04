"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileJson, Loader2, Route, Store, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { createClient } from "@/lib/supabase/client";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
}

interface PreviewProduct {
  id: number;
  title: string;
  handle: string;
  images: { src: string }[];
  variants: { id: number; sku: string | null; price: string }[];
  sourceUrl: string;
}

interface CheckoutConfig {
  id: string;
  name: string;
  mode: string;
  public_token: string;
  enabled: boolean;
  source_store_id: string;
  target_store_id: string;
  sku_map: Record<string, string>;
  variant_map: Record<string, string>;
}

interface CloneRun {
  id: string;
  source_domain: string;
  action: string;
  status: string;
  product_count: number;
  result: {
    createdCount?: number;
    skippedCount?: number;
    failedCount?: number;
    skuMapCount?: number;
    variantMapCount?: number;
  } | null;
  created_at: string;
}

const DEFAULT_SKU_MAP = `{
  "SKU-DA-VITRINE": "gid://shopify/ProductVariant/1234567890"
}`;

const DEFAULT_VARIANT_MAP = `{
  "gid://shopify/ProductVariant/111": "gid://shopify/ProductVariant/222"
}`;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseJsonMap(value: string, label: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, string>;
  } catch {
    throw new Error(`${label} precisa ser um JSON objeto valido.`);
  }
}

export default function ClonePage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState("50");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [createRoutingConfig, setCreateRoutingConfig] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"json" | "csv" | null>(null);
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [sourceDomain, setSourceDomain] = useState("");

  const [configs, setConfigs] = useState<CheckoutConfig[]>([]);
  const [cloneRuns, setCloneRuns] = useState<CloneRun[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [routeName, setRouteName] = useState("Vitrine para dark store");
  const [routeSourceStoreId, setRouteSourceStoreId] = useState("");
  const [routeTargetStoreId, setRouteTargetStoreId] = useState("");
  const [routeMode, setRouteMode] = useState("enterprise_static");
  const [skuMap, setSkuMap] = useState(DEFAULT_SKU_MAP);
  const [variantMap, setVariantMap] = useState(DEFAULT_VARIANT_MAP);
  const [routeSaving, setRouteSaving] = useState(false);

  const selectedTarget = useMemo(
    () => stores.find((store) => store.id === targetStoreId),
    [stores, targetStoreId]
  );

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Nao foi possivel carregar suas lojas.");
      }

      const loadedStores = data || [];
      setStores(loadedStores);
      if (loadedStores[0]) {
        setTargetStoreId(loadedStores[0].id);
        setSourceStoreId(loadedStores[0].id);
        setRouteSourceStoreId(loadedStores[0].id);
      }
      if (loadedStores[1]) {
        setRouteTargetStoreId(loadedStores[1].id);
      } else if (loadedStores[0]) {
        setRouteTargetStoreId(loadedStores[0].id);
      }
      setStoresLoading(false);
    }

    void loadStores();
  }, []);

  async function loadConfigs() {
    setConfigsLoading(true);
    try {
      const res = await fetch("/api/checkout-routes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar rotas.");
      setConfigs(data.configs || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar rotas.");
    } finally {
      setConfigsLoading(false);
    }
  }

  async function loadCloneRuns() {
    const supabase = createClient();
    const { data } = await supabase
      .from("clone_runs")
      .select("id, source_domain, action, status, product_count, result, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    setCloneRuns((data || []) as CloneRun[]);
  }

  useEffect(() => {
    void loadConfigs();
    void loadCloneRuns();
  }, []);

  async function runClone(action: "preview" | "export-json" | "export-csv" | "apply") {
    const payload = {
      source,
      action,
      sourceStoreId,
      targetStoreId,
      limit: Number(limit || 50),
      publishToStorefront,
      duplicatePolicy,
      createRoutingConfig,
    };

    const res = await fetch("/api/shopify/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (action === "export-csv") {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao exportar CSV.");
      }
      return { blob: await res.blob() };
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no clone.");
    return data;
  }

  async function handlePreview() {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }

    setPreviewLoading(true);
    try {
      const data = await runClone("preview");
      setPreview(data.products || []);
      setSourceDomain(data.sourceDomain || "");
      toast.success(`${data.count || 0} produtos encontrados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao analisar loja.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport(format: "json" | "csv") {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }

    setExportLoading(format);
    try {
      if (format === "csv") {
        const data = await runClone("export-csv");
        downloadBlob(`${sourceDomain || "shopify"}-products.csv`, data.blob);
      } else {
        const data = await runClone("export-json");
        downloadBlob(
          `${data.sourceDomain || "shopify"}-products.json`,
          new Blob([JSON.stringify(data.products || [], null, 2)], {
            type: "application/json",
          })
        );
      }
      toast.success(`Export ${format.toUpperCase()} gerado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar.");
    } finally {
      setExportLoading(null);
    }
  }

  async function handleApply() {
    if (!source.trim() || !targetStoreId) {
      toast.error("Informe origem e destino.");
      return;
    }

    setApplyLoading(true);
    try {
      const data = await runClone("apply");
      toast.success(`${data.createdCount || 0} produtos aplicados em ${selectedTarget?.name || "Shopify"}.`);
      if (data.failedCount) {
        toast.error(`${data.failedCount} produtos falharam.`);
      }
      await Promise.all([loadConfigs(), loadCloneRuns()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao aplicar clone.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleCreateRoute() {
    if (!routeSourceStoreId || !routeTargetStoreId || !routeName.trim()) {
      toast.error("Preencha nome, vitrine e dark store.");
      return;
    }

    setRouteSaving(true);
    try {
      const res = await fetch("/api/checkout-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          sourceStoreId: routeSourceStoreId,
          targetStoreId: routeTargetStoreId,
          mode: routeMode,
          skuMap: parseJsonMap(skuMap, "SKU map"),
          variantMap: parseJsonMap(variantMap, "Variant map"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar rota.");
      toast.success("Checkout roteado criado.");
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar rota.");
    } finally {
      setRouteSaving(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-3 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              multi-fonte
            </Badge>
            <Badge variant="outline" className="rounded-md">
              routed checkout
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Clone e roteamento
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Importe vitrines Shopify, exporte catálogo e conecte uma vitrine a uma dark store.
          </p>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Copy className="h-4 w-4 text-primary" />
              Clone de loja Shopify
            </CardTitle>
            <CardDescription>Origem publica via /products.json.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_120px]">
              <div className="space-y-2">
                <Label htmlFor="source">Loja de origem</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="exemplo.myshopify.com ou dominio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="limit">Limite</Label>
                <Input
                  id="limit"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>Destino conectado</Label>
                <Select value={targetStoreId} onValueChange={(value) => setTargetStoreId(value || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name} ({store.shop_domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex h-8 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={publishToStorefront}
                  onChange={(event) => setPublishToStorefront(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Publicar
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Vitrine para mapear</Label>
                <Select value={sourceStoreId} onValueChange={(value) => setSourceStoreId(value || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Loja vitrine" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Duplicados</Label>
                <Select value={duplicatePolicy} onValueChange={(value) => setDuplicatePolicy(value || "skip")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Pular existentes</SelectItem>
                    <SelectItem value="create">Criar mesmo assim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={createRoutingConfig}
                  onChange={(event) => setCreateRoutingConfig(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Gerar rota
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePreview} disabled={previewLoading || storesLoading}>
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                Analisar
              </Button>
              <Button variant="outline" onClick={() => handleExport("json")} disabled={Boolean(exportLoading)}>
                {exportLoading === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                JSON
              </Button>
              <Button variant="outline" onClick={() => handleExport("csv")} disabled={Boolean(exportLoading)}>
                {exportLoading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                CSV
              </Button>
              <Button onClick={handleApply} disabled={applyLoading || !targetStoreId}>
                {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                Aplicar na loja
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Prévia</CardTitle>
            <CardDescription>
              {sourceDomain ? `${sourceDomain} - ${preview.length} produtos` : "Nenhuma origem analisada"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
                A prévia aparece aqui.
              </div>
            ) : (
              <div className="max-h-[430px] space-y-2 overflow-auto pr-1">
                {preview.slice(0, 30).map((product) => (
                  <a
                    key={product.id}
                    href={product.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-3 rounded-lg border border-border/60 bg-background/45 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {product.images[0]?.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0].src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {product.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.variants.length} variantes · {product.variants[0]?.price || "0.00"}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de clone</CardTitle>
            <CardDescription>Últimas execuções registradas no Supabase.</CardDescription>
          </CardHeader>
          <CardContent>
            {cloneRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Nenhuma execução registrada.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {cloneRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border border-border/60 bg-background/45 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {run.source_domain}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {run.action} · {run.product_count} produtos
                        </p>
                      </div>
                      <Badge variant={run.status === "completed" ? "secondary" : "destructive"} className="rounded-md">
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.createdCount || 0}</span>
                        criados
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.skippedCount || 0}</span>
                        pulados
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.variantMapCount || 0}</span>
                        mapas
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.failedCount || 0}</span>
                        falhas
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="h-4 w-4 text-primary" />
              Checkout roteado
            </CardTitle>
            <CardDescription>Mapeamento SKU/variant para dark store.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="route-name">Nome</Label>
              <Input
                id="route-name"
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Vitrine</Label>
                <Select value={routeSourceStoreId} onValueChange={(value) => setRouteSourceStoreId(value || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dark store</Label>
                <Select value={routeTargetStoreId} onValueChange={(value) => setRouteTargetStoreId(value || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo</Label>
                <Select value={routeMode} onValueChange={(value) => setRouteMode(value || "standard")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">standard</SelectItem>
                    <SelectItem value="enterprise">enterprise</SelectItem>
                    <SelectItem value="enterprise_static">enterprise_static</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku-map">SKU map</Label>
                <Textarea
                  id="sku-map"
                  value={skuMap}
                  onChange={(event) => setSkuMap(event.target.value)}
                  rows={7}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-map">Variant map</Label>
                <Textarea
                  id="variant-map"
                  value={variantMap}
                  onChange={(event) => setVariantMap(event.target.value)}
                  rows={7}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <Button onClick={handleCreateRoute} disabled={routeSaving}>
              {routeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              Criar rota
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Rotas ativas</CardTitle>
            <CardDescription>
              {configsLoading ? "Carregando" : `${configs.length} configuracoes`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
                Nenhuma rota criada.
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="rounded-lg border border-border/60 bg-background/45 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">{config.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {config.mode} · {config.enabled ? "ativo" : "pausado"}
                        </p>
                      </div>
                      <Badge variant={config.enabled ? "secondary" : "outline"} className="rounded-md">
                        {Object.keys(config.sku_map || {}).length + Object.keys(config.variant_map || {}).length} mapas
                      </Badge>
                    </div>
                    <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                      token: {config.public_token}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
