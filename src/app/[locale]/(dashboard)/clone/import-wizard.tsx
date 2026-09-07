"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  SlidersHorizontal,
  Store,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MAX_CLONE_LIMIT,
  TransformedPreviewCard,
  formatStoreLabel,
  parseCloneLimit,
} from "./clone-shared";
import type {
  CloneApplyProgress,
  ImportMode,
  InventoryMode,
  PreviewProduct,
  PreviewSort,
  SourceCollection,
  StoreOption,
  TransformedPreviewProduct,
} from "./clone-shared";

const CustomPromptDialog = dynamic(
  () =>
    import("@/components/products/CustomPromptDialog").then(
      (m) => m.CustomPromptDialog
    ),
  { ssr: false }
);

/**
 * O assistente de importação.
 *
 * Mora em módulo próprio para não entrar no primeiro download da tela: são
 * mil linhas que só existem depois que alguém abre o diálogo.
 */
export interface ImportWizardProps {
  applyLoading: boolean;
  applyLogoToCloneImages: boolean;
  applyProgress: CloneApplyProgress | null;
  cloneAbortRef: React.RefObject<AbortController | null>;
  cloneAiMediaLimit: string;
  cloneCustomPrompt: string;
  cloneFailures: { handle: string; error: string }[];
  cloneGenericizeText: boolean;
  cloneNeutralizationInstructions: string;
  createRoutingConfig: boolean;
  duplicatePolicy: string;
  handleApply: () => void | Promise<void>;
  handlePreview: () => void | Promise<void>;
  handleTransformPreview: () => void | Promise<void>;
  importMode: ImportMode;
  importScope: "all" | "collection";
  importStep: number;
  importWizardOpen: boolean;
  inventoryMode: InventoryMode;
  inventoryQuantity: string;
  limit: string;
  loadSourceCollectionOptions: () => void | Promise<void>;
  loadingSourceCollections: boolean;
  neutralizeCloneProducts: boolean;
  openInlineImport: (mode: ImportMode) => void;
  preview: PreviewProduct[];
  previewCollectionOptions: { handle: string; title: string; count: number }[];
  previewCollections: string[];
  previewLoading: boolean;
  previewSearch: string;
  previewSort: PreviewSort;
  publishToStorefront: boolean;
  removeExternalReferencesCloneProducts: boolean;
  selectedProductHandles: string[];
  selectedSourceCollection: SourceCollection | null;
  selectedTarget: StoreOption | undefined;
  setApplyLogoToCloneImages: React.Dispatch<React.SetStateAction<boolean>>;
  setCloneAiMediaLimit: React.Dispatch<React.SetStateAction<string>>;
  setCloneCustomPrompt: React.Dispatch<React.SetStateAction<string>>;
  setCloneGenericizeText: React.Dispatch<React.SetStateAction<boolean>>;
  setCloneNeutralizationInstructions: React.Dispatch<React.SetStateAction<string>>;
  setCreateRoutingConfig: React.Dispatch<React.SetStateAction<boolean>>;
  setDuplicatePolicy: React.Dispatch<React.SetStateAction<string>>;
  setImportScope: React.Dispatch<React.SetStateAction<"all" | "collection">>;
  setImportStep: React.Dispatch<React.SetStateAction<number>>;
  setImportWizardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setInventoryMode: React.Dispatch<React.SetStateAction<InventoryMode>>;
  setInventoryQuantity: React.Dispatch<React.SetStateAction<string>>;
  setLimit: React.Dispatch<React.SetStateAction<string>>;
  setNeutralizeCloneProducts: React.Dispatch<React.SetStateAction<boolean>>;
  setPreview: React.Dispatch<React.SetStateAction<PreviewProduct[]>>;
  setPreviewCollections: React.Dispatch<React.SetStateAction<string[]>>;
  setPreviewKey: React.Dispatch<React.SetStateAction<string>>;
  setPreviewSearch: React.Dispatch<React.SetStateAction<string>>;
  setPreviewSort: React.Dispatch<React.SetStateAction<PreviewSort>>;
  setPublishToStorefront: React.Dispatch<React.SetStateAction<boolean>>;
  setRemoveExternalReferencesCloneProducts: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedSourceCollection: React.Dispatch<React.SetStateAction<SourceCollection | null>>;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setTargetStoreId: React.Dispatch<React.SetStateAction<string>>;
  setTranslateCloneProducts: React.Dispatch<React.SetStateAction<boolean>>;
  setTranslateVariantOptions: React.Dispatch<React.SetStateAction<boolean>>;
  source: string;
  sourceCollectionOptions: SourceCollection[];
  sourceDomain: string;
  stores: StoreOption[];
  t: (chave: string) => string;
  targetStoreId: string;
  toggleAllProducts: (checked: boolean) => void;
  toggleProductHandle: (handle: string, checked: boolean) => void;
  transformPreviewLoading: boolean;
  transformedPreview: TransformedPreviewProduct | null;
  translateCloneProducts: boolean;
  translateVariantOptions: boolean;
  visiblePreview: PreviewProduct[];
}

export function ImportWizard({
  applyLoading,
  applyLogoToCloneImages,
  applyProgress,
  cloneAbortRef,
  cloneAiMediaLimit,
  cloneCustomPrompt,
  cloneFailures,
  cloneGenericizeText,
  cloneNeutralizationInstructions,
  createRoutingConfig,
  duplicatePolicy,
  handleApply,
  handlePreview,
  handleTransformPreview,
  importMode,
  importScope,
  importStep,
  importWizardOpen,
  inventoryMode,
  inventoryQuantity,
  limit,
  loadSourceCollectionOptions,
  loadingSourceCollections,
  neutralizeCloneProducts,
  openInlineImport,
  preview,
  previewCollectionOptions,
  previewCollections,
  previewLoading,
  previewSearch,
  previewSort,
  publishToStorefront,
  removeExternalReferencesCloneProducts,
  selectedProductHandles,
  selectedSourceCollection,
  selectedTarget,
  setApplyLogoToCloneImages,
  setCloneAiMediaLimit,
  setCloneCustomPrompt,
  setCloneGenericizeText,
  setCloneNeutralizationInstructions,
  setCreateRoutingConfig,
  setDuplicatePolicy,
  setImportScope,
  setImportStep,
  setImportWizardOpen,
  setInventoryMode,
  setInventoryQuantity,
  setLimit,
  setNeutralizeCloneProducts,
  setPreview,
  setPreviewCollections,
  setPreviewKey,
  setPreviewSearch,
  setPreviewSort,
  setPublishToStorefront,
  setRemoveExternalReferencesCloneProducts,
  setSelectedSourceCollection,
  setSource,
  setTargetStoreId,
  setTranslateCloneProducts,
  setTranslateVariantOptions,
  source,
  sourceCollectionOptions,
  sourceDomain,
  stores,
  t,
  targetStoreId,
  toggleAllProducts,
  toggleProductHandle,
  transformPreviewLoading,
  transformedPreview,
  translateCloneProducts,
  translateVariantOptions,
  visiblePreview,
}: ImportWizardProps) {
  return (
      <Dialog open={importWizardOpen} onOpenChange={setImportWizardOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-2xl"
          showCloseButton={!applyLoading}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              {importMode === "single"
                ? "Importar produto individual"
                : "Importar produtos em massa"}
            </DialogTitle>
            <DialogDescription>
              Siga os passos: origem, seleção, opções e importação.
            </DialogDescription>
          </DialogHeader>

          {/* Alterna individual / massa */}
          <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                openInlineImport("single");
                setImportStep(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                importMode === "single"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("mode_individual")}
            </button>
            <button
              type="button"
              onClick={() => {
                openInlineImport("bulk");
                setImportStep(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                importMode === "bulk"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("mode_bulk")}
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1.5">
            {(importMode === "bulk"
              ? [
                  [1, t("step_origin")],
                  [2, t("step_products")],
                  [3, t("step_options")],
                  [4, t("step_review")],
                ]
              : [
                  [1, t("step_origin")],
                  [3, t("step_options")],
                  [4, t("step_review")],
                ]
            ).map(([n, label]) => {
              const active = importStep === n;
              const done = importStep > Number(n);
              return (
                <div
                  key={String(n)}
                  className="flex flex-1 items-center gap-1.5"
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      done && "bg-primary/15 text-primary",
                      active && "bg-primary text-primary-foreground",
                      !active && !done && "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : String(n)}
                  </div>
                  <span
                    className={cn(
                      "truncate text-xs",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Passo 1 - Origem e destino */}
          {importStep === 1 && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-source">
                    {importMode === "single"
                      ? t("source_url_label")
                      : t("source_store_label")}
                  </Label>
                  <Input
                    id="wiz-source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder={
                      importMode === "single"
                        ? "https://loja.com/products/produto"
                        : "Shopify ou WooCommerce: dominio.com"
                    }
                  />
                  {importMode === "bulk" && (
                    <p className="text-[11px] text-muted-foreground">
                      Detecta automaticamente Shopify ou WooCommerce pelo link.
                    </p>
                  )}
                </div>
                {importMode === "bulk" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-limit">{t("limit_label")}</Label>
                    <Input
                      id="wiz-limit"
                      value={limit}
                      onChange={(event) => setLimit(event.target.value)}
                      inputMode="numeric"
                      min={1}
                      max={MAX_CLONE_LIMIT}
                      type="number"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("target_store_label")}</Label>
                  <Select
                    value={targetStoreId}
                    onValueChange={(value) => setTargetStoreId(value || "")}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Selecione uma loja">
                        {formatStoreLabel(selectedTarget)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {formatStoreLabel(store)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("duplicates_label")}</Label>
                  <Select
                    value={duplicatePolicy}
                    onValueChange={(value) =>
                      setDuplicatePolicy(value || "skip")
                    }
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="skip">{t("skip_existing")}</SelectItem>
                      <SelectItem value="create">{t("create_anyway")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Passo 2 - Selecionar produtos (massa) */}
          {importStep === 2 && importMode === "bulk" && (
            <div className="space-y-3">
              {/* Escopo: loja inteira ou uma colecao */}
              <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
                <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setImportScope("all");
                      setSelectedSourceCollection(null);
                      setPreview([]);
                      setPreviewKey("");
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                      importScope === "all"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("scope_all")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportScope("collection");
                      setPreview([]);
                      setPreviewKey("");
                      if (sourceCollectionOptions.length === 0) {
                        void loadSourceCollectionOptions();
                      }
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                      importScope === "collection"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("scope_collection")}
                  </button>
                </div>

                {importScope === "collection" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Escolha a coleção da loja de origem para importar só ela.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadSourceCollectionOptions}
                        disabled={loadingSourceCollections || !source.trim()}
                      >
                        {loadingSourceCollections ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Recarregar
                      </Button>
                    </div>
                    {sourceCollectionOptions.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/70 bg-background/45 p-4 text-center text-xs text-muted-foreground">
                        {loadingSourceCollections
                          ? "Carregando coleções…"
                          : "Nenhuma coleção carregada."}
                      </div>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-auto">
                        {sourceCollectionOptions.map((collection) => (
                          <button
                            type="button"
                            key={collection.handle}
                            onClick={() => {
                              setSelectedSourceCollection(collection);
                              setPreview([]);
                              setPreviewKey("");
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors",
                              selectedSourceCollection?.handle ===
                                collection.handle
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/60 hover:bg-muted/40"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                                selectedSourceCollection?.handle ===
                                  collection.handle
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/40"
                              )}
                            >
                              {selectedSourceCollection?.handle ===
                                collection.handle && (
                                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {collection.title}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                /collections/{collection.handle}
                                {typeof collection.productsCount === "number"
                                  ? ` · ${collection.productsCount} produto(s)`
                                  : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={
                    previewLoading ||
                    !source.trim() ||
                    (importScope === "collection" && !selectedSourceCollection)
                  }
                >
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {importScope === "collection"
                    ? t("analyze_collection_btn")
                    : t("analyze_origin_btn")}
                </Button>
                {preview.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={
                        visiblePreview.length > 0 &&
                        visiblePreview.every((product) =>
                          selectedProductHandles.includes(product.handle)
                        )
                      }
                      onChange={(event) =>
                        toggleAllProducts(event.target.checked)
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {t("select_all")}
                  </label>
                )}
              </div>

              {/* Busca + ordenacao + filtro por categoria da lista carregada */}
              {preview.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={previewSearch}
                      onChange={(event) => setPreviewSearch(event.target.value)}
                      placeholder="Buscar por título, handle ou SKU"
                      className="h-9 flex-1 text-sm"
                    />
                    <Select
                      value={previewSort}
                      onValueChange={(value) =>
                        setPreviewSort(value as PreviewSort)
                      }
                    >
                      <SelectTrigger className="h-9 w-full sm:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="source">Ordem da origem</SelectItem>
                        <SelectItem value="recent">Mais recentes</SelectItem>
                        <SelectItem value="title_asc">Título (A-Z)</SelectItem>
                        <SelectItem value="title_desc">Título (Z-A)</SelectItem>
                        <SelectItem value="price_asc">Menor preço</SelectItem>
                        <SelectItem value="price_desc">Maior preço</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {previewCollectionOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Filtrar por categoria
                        </p>
                        {previewCollections.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewCollections([])}
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                        {previewCollectionOptions.map((collection) => {
                          const active = previewCollections.includes(
                            collection.handle
                          );
                          return (
                            <button
                              key={collection.handle}
                              type="button"
                              onClick={() =>
                                setPreviewCollections((current) =>
                                  active
                                    ? current.filter(
                                        (item) => item !== collection.handle
                                      )
                                    : [...current, collection.handle]
                                )
                              }
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                                active
                                  ? "border-primary bg-primary/15 text-foreground"
                                  : "border-border/70 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {collection.title}
                              <span className="ml-1 opacity-60">
                                {collection.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {preview.length
                  ? `${selectedProductHandles.length} selecionado(s) · exibindo ${visiblePreview.length} de ${preview.length}`
                  : "Clique em analisar para carregar os produtos da origem."}
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
                {preview.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {t("no_products_loaded")}
                  </div>
                ) : visiblePreview.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum produto corresponde ao filtro.
                  </div>
                ) : (
                  visiblePreview.map((product) => (
                    <label
                      key={product.handle}
                      className="grid cursor-pointer grid-cols-[24px_48px_minmax(0,1fr)] gap-3 border-b border-border/50 p-3 last:border-b-0 hover:bg-muted/35"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductHandles.includes(
                          product.handle
                        )}
                        onChange={(event) =>
                          toggleProductHandle(
                            product.handle,
                            event.target.checked
                          )
                        }
                        className="mt-3 h-4 w-4 accent-primary"
                      />
                      <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border/60 bg-muted">
                        {product.images?.[0]?.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0].src}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {product.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.variants.length} variante(s) ·{" "}
                          {product.variants[0]?.price || "0.00"}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Passo 3 - Opções */}
          {importStep === 3 && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={publishToStorefront}
                    onChange={(event) =>
                      setPublishToStorefront(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Publicar produto
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Online Store ao importar.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={translateCloneProducts}
                    onChange={(event) =>
                      setTranslateCloneProducts(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Traduzir produto
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Idioma da loja destino.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={translateVariantOptions}
                    onChange={(event) =>
                      setTranslateVariantOptions(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Traduzir variações
                    </span>
                    <span className="text-xs text-muted-foreground">
                      blue {"->"} azul, S/small {"->"} P.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={neutralizeCloneProducts}
                    onChange={(event) => {
                      setNeutralizeCloneProducts(event.target.checked);
                      if (event.target.checked) {
                        setRemoveExternalReferencesCloneProducts(false);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <WandSparkles className="h-3.5 w-3.5 text-primary" />
                      Neutralizar (stock)
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Remove marcas, inclusive do próprio produto.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={removeExternalReferencesCloneProducts}
                    onChange={(event) => {
                      setRemoveExternalReferencesCloneProducts(
                        event.target.checked
                      );
                      if (event.target.checked) {
                        setNeutralizeCloneProducts(false);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <WandSparkles className="h-3.5 w-3.5 text-primary" />
                      Retirar referências externas
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Mantém marcas reais, limpa origem/vendedor.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={applyLogoToCloneImages}
                    onChange={(event) =>
                      setApplyLogoToCloneImages(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <ImageIcon className="h-3.5 w-3.5 text-primary" />
                      Aplicar logo
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Marca as imagens em massa.
                    </span>
                  </span>
                </label>
              </div>

              {(neutralizeCloneProducts ||
                removeExternalReferencesCloneProducts) && (
                <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 md:grid-cols-[minmax(0,1fr)_140px]">
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="wiz-ai-media-limit">
                        Mídias com IA por produto
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        A IA processa só as primeiras; as outras seguem
                        originais (controle de custo).
                      </p>
                    </div>
                    {neutralizeCloneProducts && (
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={cloneGenericizeText}
                          onChange={(event) =>
                            setCloneGenericizeText(event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                          Genericizar nome/descrição (Air Jordan → Tênis
                          esportivo).
                        </span>
                      </label>
                    )}
                  </div>
                  <Input
                    id="wiz-ai-media-limit"
                    type="number"
                    min={1}
                    max={20}
                    value={cloneAiMediaLimit}
                    onChange={(event) =>
                      setCloneAiMediaLimit(event.target.value)
                    }
                    className="h-10 bg-background/70"
                  />
                </div>
              )}

              {neutralizeCloneProducts && (
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-neutralization-instructions">
                    Instruções extras para neutralização
                  </Label>
                  <Textarea
                    id="wiz-neutralization-instructions"
                    rows={2}
                    value={cloneNeutralizationInstructions}
                    onChange={(event) =>
                      setCloneNeutralizationInstructions(event.target.value)
                    }
                    placeholder="Ex.: remover só o patch FIFA, manter o escudo do time."
                    className="bg-background/70 text-sm"
                  />
                </div>
              )}

              <CustomPromptDialog
                value={cloneCustomPrompt}
                onChange={(nextPrompt) => setCloneCustomPrompt(nextPrompt)}
                className="w-full"
              />

              <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                <div className="space-y-1.5">
                  <Label>Estoque</Label>
                  <Select
                    value={inventoryMode}
                    onValueChange={(value) =>
                      setInventoryMode((value || "not_tracked") as InventoryMode)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="not_tracked">
                        Inventory not tracked
                      </SelectItem>
                      <SelectItem value="tracked">
                        Definir estoque inicial
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input
                    value={inventoryQuantity}
                    onChange={(event) =>
                      setInventoryQuantity(event.target.value)
                    }
                    type="number"
                    min={0}
                    disabled={inventoryMode === "not_tracked"}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={createRoutingConfig}
                  onChange={(event) =>
                    setCreateRoutingConfig(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">
                    Preparar rota (checkout roteado)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Gera o mapa para usar com a Loja vitrine.
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Passo 4 - Revisar e importar */}
          {importStep === 4 && (
            <div className="space-y-3">
              {/* Resumo do que vai ser importado */}
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">
                        Origem
                      </span>
                      <span className="block truncate font-medium text-foreground">
                        {sourceDomain || source || "—"}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">
                        Destino
                      </span>
                      <span className="block truncate font-medium text-foreground">
                        {formatStoreLabel(selectedTarget)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">
                        Escopo
                      </span>
                      <span className="block truncate font-medium text-foreground">
                        {importMode === "single"
                          ? "Produto individual"
                          : importScope === "collection" &&
                              selectedSourceCollection
                            ? `Coleção: ${selectedSourceCollection.title}`
                            : "Loja inteira"}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">
                        Produtos
                      </span>
                      <span className="block font-medium text-foreground">
                        {importMode === "single"
                          ? "1 produto"
                          : `${selectedProductHandles.length || preview.length} produto(s)`}
                      </span>
                    </span>
                  </div>
                </div>

                {importMode === "bulk" &&
                  importScope === "collection" &&
                  selectedSourceCollection && (
                    <p className="rounded-md bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
                      Os produtos entram na coleção{" "}
                      <span className="font-medium text-foreground">
                        {selectedSourceCollection.title}
                      </span>{" "}
                      criada na loja de destino.
                    </p>
                  )}

                <div className="flex flex-wrap gap-1.5">
                  {[
                    publishToStorefront && "Publicar",
                    translateCloneProducts && "Traduzir",
                    translateVariantOptions && "Traduzir variações",
                    neutralizeCloneProducts && "Neutralizar",
                    removeExternalReferencesCloneProducts &&
                      "Limpar refs externas",
                    applyLogoToCloneImages && "Aplicar logo",
                    createRoutingConfig && "Preparar rota",
                    inventoryMode === "tracked" &&
                      `Estoque: ${inventoryQuantity}`,
                    duplicatePolicy === "skip"
                      ? "Pular duplicados"
                      : "Criar duplicados",
                  ]
                    .filter(Boolean)
                    .map((label) => (
                      <Badge
                        key={String(label)}
                        variant="secondary"
                        className="rounded-md text-[11px]"
                      >
                        {label}
                      </Badge>
                    ))}
                </div>
              </div>

              {/* Grid dos produtos que serao importados */}
              {importMode === "bulk" && preview.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Pré-visualização dos produtos
                  </p>
                  <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-auto sm:grid-cols-6">
                    {preview
                      .filter(
                        (product) =>
                          selectedProductHandles.length === 0 ||
                          selectedProductHandles.includes(product.handle)
                      )
                      .slice(0, 18)
                      .map((product) => (
                        <div
                          key={product.handle}
                          className="relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted"
                          title={product.title}
                        >
                          {product.images?.[0]?.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.images[0].src}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {importMode === "bulk"
                    ? `${selectedProductHandles.length} produto(s) selecionado(s)`
                    : "Produto individual"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTransformPreview}
                  disabled={
                    transformPreviewLoading || !source.trim() || !targetStoreId
                  }
                >
                  {transformPreviewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="h-4 w-4" />
                  )}
                  Visualizar 1 produto
                </Button>
              </div>

              {transformedPreview ? (
                <TransformedPreviewCard preview={transformedPreview} />
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                  Clique em Visualizar para conferir como 1 produto fica com os
                  critérios atuais antes de importar tudo.
                </div>
              )}

              {applyProgress && (
                <div className="rounded-lg border border-primary/25 bg-primary/8 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      {applyProgress.message}
                    </p>
                    <Badge variant="secondary" className="rounded-md">
                      {applyProgress.total > 0
                        ? `${applyProgress.current}/${applyProgress.total}`
                        : "calculando"}
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/70">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width:
                          applyProgress.total > 0
                            ? `${Math.min(100, (applyProgress.current / applyProgress.total) * 100)}%`
                            : "8%",
                      }}
                    />
                  </div>

                  {/* Contadores ao vivo: ja existiam no estado e nunca eram exibidos */}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      {applyProgress.created} criados · {applyProgress.skipped}{" "}
                      pulados · {applyProgress.failed} falhas
                    </p>
                    {applyLoading && applyProgress.phase !== "done" && (
                      <button
                        type="button"
                        onClick={() => cloneAbortRef.current?.abort()}
                        className="rounded border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Detalhe das falhas — antes so aparecia a contagem num toast */}
              {cloneFailures.length > 0 && (
                <details className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    {cloneFailures.length} produto(s) não importado(s) — ver
                    motivo
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {cloneFailures.map((failure, index) => (
                      <li
                        key={`${failure.handle}-${index}`}
                        className="text-[11px] leading-relaxed text-muted-foreground"
                      >
                        <span className="font-medium text-foreground/90">
                          {failure.handle}
                        </span>
                        : {failure.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Navegação */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setImportStep((current) =>
                  current === 4
                    ? 3
                    : current === 3
                      ? importMode === "bulk"
                        ? 2
                        : 1
                      : 1
                )
              }
              disabled={importStep === 1 || applyLoading}
            >
              Voltar
            </Button>
            {importStep === 4 ? (
              <Button
                onClick={handleApply}
                disabled={
                  applyLoading ||
                  !source.trim() ||
                  !targetStoreId ||
                  (importMode === "bulk" &&
                    preview.length > 0 &&
                    selectedProductHandles.length === 0)
                }
              >
                {applyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Store className="h-4 w-4" />
                )}
                Importar agora
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setImportStep((current) =>
                    current === 1
                      ? importMode === "bulk"
                        ? 2
                        : 3
                      : current === 2
                        ? 3
                        : 4
                  )
                }
                disabled={importStep === 1 && (!source.trim() || !targetStoreId)}
              >
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
  );
}
