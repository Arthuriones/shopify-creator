"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  FileOutput,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  SlidersHorizontal,
  Store,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { getPublicAppUrl } from "@/lib/public-url";
import { CustomPromptDialog } from "@/components/products/CustomPromptDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  collectionHandles?: string[];
}

// Ordenacao da lista de preview. "source" mantem a ordem em que a loja de
// origem publicou os produtos (padrao); "recent" usa o id, que na Shopify
// cresce com o tempo de criacao.
type PreviewSort =
  | "source"
  | "title_asc"
  | "title_desc"
  | "price_asc"
  | "price_desc"
  | "recent";

function previewPrice(product: PreviewProduct) {
  const prices = (product.variants || [])
    .map((variant) => Number.parseFloat(variant.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

interface TransformedPreviewProduct {
  source: {
    title: string;
    handle: string;
    images: { src: string }[];
  };
  transformed: {
    title: string;
    descriptionHtml: string;
    tags: string[];
    seo?: { title?: string; description?: string };
    images: { src: string; altText?: string | null }[];
    variants: { price?: string; compareAtPrice?: string; options?: string[] }[];
  };
  neutralized: boolean;
  logoAppliedCount: number;
  warnings: string[];
}

interface SourceCollection {
  id: number;
  title: string;
  handle: string;
  image?: string | null;
  productsUrl: string;
  /** Quantos produtos a colecao tem na origem (vem da /collections.json). */
  productsCount?: number | null;
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
  settings?: {
    checkout_domain?: string;
    checkout_country?: string;
    checkout_locale?: string;
    // Escrito pelo auto-conserto de hora em hora. Deixa o card dizer o estado
    // da rota sem o usuario precisar clicar em Verificar.
    last_heal?: {
      at: string;
      ok: boolean;
      message?: string;
      mappedCount?: number;
    };
  };
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

interface CloneApplyProgress {
  phase: "analyzing" | "importing" | "routing" | "done";
  current: number;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  message: string;
}

// O roteamento saiu daqui: vive na propria tela (clone/routed-checkout/page.tsx).
type CloneView = "overview" | "shopify" | "export";
type InventoryMode = "not_tracked" | "tracked";
type ImportMode = "single" | "bulk";

interface ConnectedVariant {
  id: string;
  title: string;
  sku?: string | null;
  price?: string;
  selectedOptions?: { name: string; value: string }[];
}


const DEFAULT_CLONE_LIMIT = 250;
const MAX_CLONE_LIMIT = 5000;
const CLONE_BATCH_SIZE = 5;

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

function parseCloneLimit(value: string) {
  const numeric = Number(value || DEFAULT_CLONE_LIMIT);
  if (!Number.isFinite(numeric)) return DEFAULT_CLONE_LIMIT;
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_CLONE_LIMIT);
}

function parseInventoryQuantity(value: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function parseAiMediaLimit(value: string) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.floor(numeric), 1), 20);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function stripPreviewHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function TransformedPreviewCard({
  preview,
}: {
  preview: TransformedPreviewProduct;
}) {
  const firstImage = preview.transformed.images?.[0]?.src;
  const firstPrice = preview.transformed.variants?.[0]?.price;
  const description = stripPreviewHtml(preview.transformed.descriptionHtml || "");

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Visualizacao IA
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            Como este produto vai ficar
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {preview.neutralized && (
            <Badge variant="secondary" className="rounded-md">
              Neutralizado
            </Badge>
          )}
          {preview.logoAppliedCount > 0 && (
            <Badge variant="secondary" className="rounded-md">
              Logo aplicada
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="h-24 w-24 overflow-hidden rounded-lg border border-border/60 bg-background/70">
          {firstImage ? (
            <img src={firstImage} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Original</p>
          <p className="truncate text-xs text-muted-foreground">
            {preview.source.title}
          </p>
          <p className="mt-2 text-sm font-semibold leading-5 text-foreground">
            {preview.transformed.title}
          </p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {description || "Sem descricao gerada."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{preview.transformed.images.length} midia(s)</span>
            <span>{preview.transformed.variants.length} variante(s)</span>
            {firstPrice ? <span>Preco: {firstPrice}</span> : null}
          </div>
        </div>
      </div>

      {preview.transformed.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {preview.transformed.tags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-md text-[11px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-amber-500">
          {preview.warnings.length} aviso(s) na transformacao. A importacao em massa
          ainda pode continuar usando as midias originais quando a IA falhar.
        </p>
      )}
    </div>
  );
}

function cloneSourceKey(sourceValue: string, limitValue: number) {
  return `${sourceValue.trim().toLowerCase()}::${limitValue}`;
}


function looksLikeGeneratedId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function looksLikeDomain(value: string) {
  return /\.|myshopify\.com|shopify\.com/i.test(value);
}

function formatDomainLabel(value?: string | null) {
  if (!value) return "";
  const clean = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^admin\.shopify\.com\/store\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .replace(/\.myshopify\.com$/i, "");

  const base = clean.includes(".") ? clean.split(".")[0] : clean;
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function formatStoreLabel(store?: StoreOption) {
  if (!store) return "Selecione uma loja";
  const name = store.name?.trim();
  if (name && name !== store.id && !looksLikeGeneratedId(name) && !looksLikeDomain(name)) {
    return name;
  }
  const domainLabel = formatDomainLabel(store.shop_domain || name);
  if (domainLabel) return domainLabel;
  return `Loja ${store.id.slice(0, 8)}`;
}


function ServiceIntro({
  icon: Icon,
  title,
  description,
  steps,
}: {
  icon: typeof Copy;
  title: string;
  description: string;
  steps: string[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/70 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
        <ol className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {steps.map((step, index) => (
          <li
            key={step}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border/50 bg-background/45 px-3 py-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </span>
              <span className="leading-5">{step}</span>
          </li>
        ))}
      </ol>
      </div>
    </div>
  );
}

function ServiceOverview() {
  const t = useTranslations("clone_page");
  const services = [
    {
      href: "/clone/shopify",
      icon: Copy,
      title: t("service_clone_title"),
      description: t("service_clone_desc"),
      bullets: ["Origem pública", "Prévia antes de gravar", "Aplicação em loja conectada"],
    },
    {
      href: "/clone/export",
      icon: FileOutput,
      title: t("service_export_title"),
      description: t("service_export_desc"),
      bullets: ["JSON completo", "CSV operacional", "Histórico de execuções"],
    },
    {
      href: "/clone/routed-checkout",
      icon: GitBranch,
      title: t("service_showcase_title"),
      description: t("service_showcase_desc"),
      bullets: ["SKU map", "Variant map", "Script no tema"],
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {services.map((service) => (
        <Link
          key={service.href}
          href={service.href}
          className="group rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary/45 hover:bg-card/80"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <service.icon className="h-4 w-4" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            {service.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {service.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {service.bullets.map((bullet) => (
              <Badge key={bullet} variant="outline" className="rounded-md">
                {bullet}
              </Badge>
            ))}
          </div>
        </Link>
      ))}
    </section>
  );
}

export default function ClonePage() {
  const t = useTranslations("clone_page");
  const pathname = usePathname();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState(String(DEFAULT_CLONE_LIMIT));
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("not_tracked");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [translateCloneProducts, setTranslateCloneProducts] = useState(false);
  const [translateVariantOptions, setTranslateVariantOptions] = useState(false);
  // Desligado por padrao: o import em massa serve para CLONAR replicas (ex.:
  // montar uma nova vitrine identica a outra). A neutralizacao da loja checkout
  // acontece no fluxo de "Criar destino", nao aqui.
  const [neutralizeCloneProducts, setNeutralizeCloneProducts] = useState(false);
  const [
    removeExternalReferencesCloneProducts,
    setRemoveExternalReferencesCloneProducts,
  ] = useState(false);
  const [cloneAiMediaLimit, setCloneAiMediaLimit] = useState("1");
  const [cloneGenericizeText, setCloneGenericizeText] = useState(true);
  const [cloneNeutralizationInstructions, setCloneNeutralizationInstructions] =
    useState("");
  const [cloneCustomPrompt, setCloneCustomPrompt] = useState("");
  const [applyLogoToCloneImages, setApplyLogoToCloneImages] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [createRoutingConfig, setCreateRoutingConfig] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [transformPreviewLoading, setTransformPreviewLoading] = useState(false);
  const [transformedPreview, setTransformedPreview] =
    useState<TransformedPreviewProduct | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"json" | "csv" | null>(null);
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [sourceDomain, setSourceDomain] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const [applyProgress, setApplyProgress] = useState<CloneApplyProgress | null>(null);
  // Detalhe das falhas do ultimo import, para o usuario saber o que deu errado.
  const [cloneFailures, setCloneFailures] = useState<
    { handle: string; error: string }[]
  >([]);
  const [importMode, setImportMode] = useState<ImportMode>("bulk");
  const [selectedImportMode, setSelectedImportMode] = useState<ImportMode | null>(null);
  const [sourceCollections, setSourceCollections] = useState<SourceCollection[]>([]);
  const [selectedProductHandles, setSelectedProductHandles] = useState<string[]>([]);
  // Filtros/ordenacao da lista de preview. Sao aplicados no cliente: o preview
  // ja traz collectionHandles por produto, entao da para filtrar por categoria
  // sem nenhuma chamada extra a origem.
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewSort, setPreviewSort] = useState<PreviewSort>("source");
  const [previewCollections, setPreviewCollections] = useState<string[]>([]);

  const [cloneRuns, setCloneRuns] = useState<CloneRun[]>([]);
  const [routeSourceStoreId, setRouteSourceStoreId] = useState("");
  const [routeTargetStoreId, setRouteTargetStoreId] = useState("");


  const [appOrigin, setAppOrigin] = useState(getPublicAppUrl());
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importScope, setImportScope] = useState<"all" | "collection">("all");
  const [selectedSourceCollection, setSelectedSourceCollection] =
    useState<SourceCollection | null>(null);
  const [sourceCollectionOptions, setSourceCollectionOptions] = useState<
    SourceCollection[]
  >([]);
  const [loadingSourceCollections, setLoadingSourceCollections] = useState(false);

  const cloneAbortRef = useRef<AbortController | null>(null);

  const activeView: CloneView = pathname === "/clone/shopify" || pathname.startsWith("/clone/shopify/")
    ? "shopify"
    : pathname.endsWith("/export")
      ? "export"
      : "overview";

  const routedImportMode: ImportMode | null = pathname.endsWith("/individual")
    ? "single"
    : pathname.endsWith("/bulk")
      ? "bulk"
      : null;
  const isCloneConfigSubpage = pathname.endsWith("/configuracao");
  const isImportSubpage = Boolean(routedImportMode);

  const pageMeta = {
    overview: {
      title: "Central de clone e checkout",
      description:
        "Escolha um recurso independente: clonar produtos, exportar catálogo ou configurar a Loja vitrine.",
    },
    shopify: {
      title: "Clone de loja Shopify",
      description:
        "Importe produtos de uma vitrine pública e aplique em uma loja conectada.",
    },
    export: {
      title: "Exportar catálogo",
      description:
        "Gere JSON ou CSV a partir de uma origem Shopify pública para revisão e backup.",
    },
    "routed-checkout": {
      title: "Loja vitrine",
      description:
        "Roteie pedidos da vitrine para o checkout da loja checkout com mapas de SKU e variant.",
    },
  }[activeView];

  const selectedTarget = useMemo(
    () => stores.find((store) => store.id === targetStoreId),
    [stores, targetStoreId]
  );

  // Categorias presentes nos produtos carregados (para os filtros por coleção).
  // Sai do proprio preview, entao cobre tambem lojas cuja listagem publica de
  // colecoes falha mas cujos produtos trazem collectionHandles.
  const previewCollectionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of preview) {
      for (const handle of product.collectionHandles || []) {
        counts.set(handle, (counts.get(handle) || 0) + 1);
      }
    }
    const titleByHandle = new Map(
      sourceCollections.map((collection) => [collection.handle, collection.title])
    );
    return [...counts.entries()]
      .map(([handle, count]) => ({
        handle,
        title: titleByHandle.get(handle) || handle,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  }, [preview, sourceCollections]);

  // Lista efetivamente exibida: busca + filtro de categoria + ordenação.
  const visiblePreview = useMemo(() => {
    const term = previewSearch.trim().toLowerCase();
    let list = preview;
    if (previewCollections.length > 0) {
      list = list.filter((product) =>
        (product.collectionHandles || []).some((handle) =>
          previewCollections.includes(handle)
        )
      );
    }
    if (term) {
      list = list.filter((product) => {
        const haystack = [
          product.title,
          product.handle,
          ...(product.variants || []).map((variant) => variant.sku || ""),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }
    if (previewSort === "source") return list;
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (previewSort) {
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "title_desc":
          return b.title.localeCompare(a.title);
        case "price_asc":
          return previewPrice(a) - previewPrice(b);
        case "price_desc":
          return previewPrice(b) - previewPrice(a);
        case "recent":
          return (b.id || 0) - (a.id || 0);
        default:
          return 0;
      }
    });
    return sorted;
  }, [preview, previewSearch, previewCollections, previewSort]);


  useEffect(() => {
    setAppOrigin(getPublicAppUrl(window.location.origin));
  }, []);

  useEffect(() => {
    if (!routedImportMode) return;
    setImportMode(routedImportMode);
    setSelectedImportMode(routedImportMode);
  }, [routedImportMode]);

  useEffect(() => {
    if (!isCloneConfigSubpage) return;
    setImportMode("bulk");
    setSelectedImportMode("bulk");
  }, [isCloneConfigSubpage]);

  function openInlineImport(mode: ImportMode) {
    setImportMode(mode);
    setSelectedImportMode(mode);
  }

  function openImportWizard(mode: ImportMode) {
    openInlineImport(mode);
    setImportStep(1);
    setImportScope("all");
    setSelectedSourceCollection(null);
    setImportWizardOpen(true);
  }

  async function loadSourceCollectionOptions() {
    if (!source.trim()) {
      toast.error("Informe a loja de origem primeiro.");
      return;
    }
    setLoadingSourceCollections(true);
    try {
      const res = await fetch(
        `/api/shopify/collections?source=${encodeURIComponent(source.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao ler coleções.");
      const loaded = (data.collections || []) as SourceCollection[];
      setSourceCollectionOptions(loaded);
      if (loaded.length === 0) {
        toast("Nenhuma coleção pública encontrada nessa loja.");
      } else {
        toast.success(`${loaded.length} coleção(ões) encontrada(s).`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao ler coleções."
      );
    } finally {
      setLoadingSourceCollections(false);
    }
  }

  // Sub-rotas /individual, /bulk, /configuracao abrem o wizard direto.
  useEffect(() => {
    if (isImportSubpage) {
      setImportStep(1);
      setImportWizardOpen(true);
    } else if (isCloneConfigSubpage) {
      setImportMode("bulk");
      setSelectedImportMode("bulk");
      setImportStep(1);
      setImportWizardOpen(true);
    }
  }, [isImportSubpage, isCloneConfigSubpage]);

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
      }
      setStoresLoading(false);
    }

    void loadStores();
  }, []);


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
    void loadCloneRuns();
  }, []);


  async function runClone(
    action: "preview" | "export-json" | "export-csv" | "apply",
    signal?: AbortSignal,
    overrides?: Record<string, unknown>
  ) {
    const payload = {
      source,
      action,
      importMode,
      sourceStoreId,
      targetStoreId,
      limit: parseCloneLimit(limit),
      inventoryMode,
      inventoryQuantity: parseInventoryQuantity(inventoryQuantity),
      publishToStorefront,
      translateProducts: translateCloneProducts,
      translateVariantOptions,
      neutralizeProducts: neutralizeCloneProducts,
      removeExternalReferences: removeExternalReferencesCloneProducts,
      // Imagem sempre em background: gerar inline durante o import em massa
      // estoura o timeout e a maioria das imagens falha. A fila se auto-encadeia
      // ate terminar, independente da janela ficar aberta.
      imageNeutralizeMode: "queue",
      aiMediaLimit: parseAiMediaLimit(cloneAiMediaLimit),
      genericizeText: cloneGenericizeText,
      neutralizationInstructions: cloneNeutralizationInstructions,
      customPrompt: cloneCustomPrompt,
      applyLogoToImages: applyLogoToCloneImages,
      duplicatePolicy,
      createRoutingConfig,
      collectionHandle:
        importScope === "collection" ? selectedSourceCollection?.handle : undefined,
      ...overrides,
    };

    const res = await fetch("/api/shopify/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
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
    setTransformedPreview(null);
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const data = await runClone("preview", controller.signal);
      const loadedProducts = (data.products || []) as PreviewProduct[];
      setPreview(loadedProducts);
      setSourceDomain(data.sourceDomain || "");
      setSourceCollections((data.collections || []) as SourceCollection[]);
      setSelectedProductHandles(loadedProducts.map((product) => product.handle));
      setPreviewKey(cloneSourceKey(source, parseCloneLimit(limit)));
      toast.success(`${data.count || 0} produtos encontrados.`);
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(error instanceof Error ? error.message : "Falha ao analisar loja.");
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setPreviewLoading(false);
    }
  }

  async function handleTransformPreview() {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }
    if (!targetStoreId) {
      toast.error("Selecione a loja de destino para visualizar.");
      return;
    }

    setTransformPreviewLoading(true);
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const selectedHandle =
        importMode === "bulk" && selectedProductHandles.length > 0
          ? selectedProductHandles[0]
          : undefined;
      const data = await runClone("preview", controller.signal, {
        transformPreview: true,
        recordRun: false,
        limit: 1,
        pageSize: 1,
        ...(selectedHandle ? { productHandles: [selectedHandle] } : {}),
      });
      const loadedProducts = (data.products || []) as PreviewProduct[];
      if (loadedProducts.length > 0) {
        setPreview((current) => (current.length > 0 ? current : loadedProducts));
        setSelectedProductHandles((current) =>
          current.length > 0
            ? current
            : loadedProducts.map((product) => product.handle)
        );
      }
      setSourceDomain(data.sourceDomain || "");
      setSourceCollections((data.collections || []) as SourceCollection[]);
      setTransformedPreview(
        (data.transformedPreview || null) as TransformedPreviewProduct | null
      );
      toast.success("Previa transformada gerada.");
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Falha ao gerar previa transformada."
        );
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setTransformPreviewLoading(false);
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
    setCloneFailures([]);
    setApplyProgress({
      phase: "analyzing",
      current: 0,
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      message: "Lendo produtos da origem antes de importar...",
    });
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const requestedLimit = parseCloneLimit(limit);
      const currentPreviewKey = cloneSourceKey(source, requestedLimit);
      let total =
        importMode === "single"
          ? 1
          : previewKey === currentPreviewKey
            ? preview.length
            : 0;
      let resolvedSourceDomain = sourceDomain;
      let previewForRun = previewKey === currentPreviewKey ? preview : [];
      let sourceCollectionsForRun = sourceCollections;
      let selectedHandlesForRun =
        importMode === "bulk" && previewKey === currentPreviewKey
          ? selectedProductHandles
          : [];

      if (
        (importMode === "bulk" && total === 0) ||
        (importMode === "single" && previewKey !== currentPreviewKey)
      ) {
        const previewData = await runClone("preview", controller.signal, {
          limit: requestedLimit,
          recordRun: false,
        });
        const loadedProducts = previewData.products || [];
        total = importMode === "single" ? 1 : loadedProducts.length;
        resolvedSourceDomain = previewData.sourceDomain || "";
        previewForRun = loadedProducts;
        sourceCollectionsForRun = (previewData.collections || []) as SourceCollection[];
        setPreview(loadedProducts);
        setSourceDomain(resolvedSourceDomain);
        setSourceCollections(sourceCollectionsForRun);
        selectedHandlesForRun = loadedProducts.map(
          (product: PreviewProduct) => product.handle
        );
        setSelectedProductHandles(selectedHandlesForRun);
        setPreviewKey(currentPreviewKey);
      }

      if (total === 0) {
        toast.error("Nenhum produto encontrado para importar.");
        return;
      }

      const aggregate = {
        attempted: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        neutralizedCount: 0,
        logoAppliedCount: 0,
        skuMap: {} as Record<string, string>,
        variantMap: {} as Record<string, string>,
        // A API ja devolve failed[] com {sourceHandle, error} por produto, mas o
        // cliente descartava tudo e mostrava so o numero. Quem via "40 produtos
        // falharam" nao tinha como saber o motivo nem quais foram.
        failures: [] as { handle: string; error: string }[],
      };

      const activeSelectedHandles =
        importMode === "bulk" && selectedHandlesForRun.length > 0
          ? selectedHandlesForRun
          : [];
      if (activeSelectedHandles.length > 0) {
        total = activeSelectedHandles.length;
      }
      const totalPages = Math.ceil(total / CLONE_BATCH_SIZE);
      for (let page = 1; page <= totalPages; page += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Operacao cancelada.", "AbortError");
        }

        const batchStart = (page - 1) * CLONE_BATCH_SIZE + 1;
        const batchEnd = Math.min(page * CLONE_BATCH_SIZE, total);
        setApplyProgress({
          phase: "importing",
          current: batchStart - 1,
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: `Importando produtos ${batchStart}-${batchEnd}/${total}...`,
        });

        const handleBatch = activeSelectedHandles.slice(
          (page - 1) * CLONE_BATCH_SIZE,
          page * CLONE_BATCH_SIZE
        );
        const productCollectionBatch = Object.fromEntries(
          previewForRun
            .filter((product) =>
              handleBatch.length > 0
                ? handleBatch.includes(product.handle)
                : product.collectionHandles?.length
            )
            .map((product) => [product.handle, product.collectionHandles || []])
        );
        const data = await runClone("apply", controller.signal, {
          importMode,
          ...(handleBatch.length > 0
            ? { productHandles: handleBatch, limit: handleBatch.length }
            : {
                page,
                pageSize: CLONE_BATCH_SIZE,
                limit: CLONE_BATCH_SIZE,
              }),
          collections: sourceCollectionsForRun.map((collection) => ({
            handle: collection.handle,
            title: collection.title,
          })),
          productCollections: productCollectionBatch,
          createRoutingConfig: false,
          recordRun: false,
        });

        const attempted = Number(data.attempted || 0);
        if (attempted === 0) break;

        aggregate.attempted += attempted;
        aggregate.createdCount += Number(data.createdCount || 0);
        aggregate.skippedCount += Number(data.skippedCount || 0);
        aggregate.failedCount += Number(data.failedCount || 0);
        aggregate.neutralizedCount += Number(data.neutralizedCount || 0);
        aggregate.logoAppliedCount += Number(data.logoAppliedCount || 0);
        Object.assign(aggregate.skuMap, data.skuMap || {});
        Object.assign(aggregate.variantMap, data.variantMap || {});
        if (Array.isArray(data.failed)) {
          for (const item of data.failed as {
            sourceHandle?: string;
            handle?: string;
            error?: string;
          }[]) {
            aggregate.failures.push({
              handle: item?.sourceHandle || item?.handle || "(sem handle)",
              error: item?.error || "Erro desconhecido",
            });
          }
        }
        setCloneFailures([...aggregate.failures]);

        setApplyProgress({
          phase: "importing",
          current: Math.min(aggregate.attempted, total),
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: `Importando produto ${Math.min(aggregate.attempted, total)}/${total}...`,
        });
      }

      // Registra UMA linha de historico com o agregado do lote. Cada batch
      // envia recordRun:false para nao poluir, o que antes deixava a
      // importacao em massa sem nenhum registro em "Execucoes recentes".
      try {
        await fetch("/api/shopify/clone/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceDomain: resolvedSourceDomain || source,
            targetStoreId,
            createdCount: aggregate.createdCount,
            skippedCount: aggregate.skippedCount,
            failedCount: aggregate.failedCount,
            neutralizedCount: aggregate.neutralizedCount,
            logoAppliedCount: aggregate.logoAppliedCount,
            failures: aggregate.failures,
          }),
        });
      } catch {
        // Historico e best-effort: nunca deve derrubar a importacao.
      }

      let routingConfig: unknown = null;
      if (createRoutingConfig && sourceStoreId && targetStoreId) {
        setApplyProgress({
          phase: "routing",
          current: Math.min(aggregate.attempted, total),
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: "Criando rota única com os mapas importados...",
        });

        const routeRes = await fetch("/api/checkout-routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name: `Clone ${resolvedSourceDomain || source} -> ${selectedTarget?.shop_domain || "destino"}`,
            sourceStoreId,
            targetStoreId,
            mode: "enterprise_static",
            skuMap: aggregate.skuMap,
            variantMap: aggregate.variantMap,
            settings: { generatedBy: "shopify_clone_batched" },
          }),
        });
        const routeData = await routeRes.json().catch(() => ({}));
        if (!routeRes.ok) {
          throw new Error(routeData.error || "Produtos criados, mas falhou ao criar rota.");
        }
        routingConfig = routeData.config;
      }

      setApplyProgress({
        phase: "done",
        current: Math.min(aggregate.attempted, total),
        total,
        created: aggregate.createdCount,
        skipped: aggregate.skippedCount,
        failed: aggregate.failedCount,
        message: "Importação concluída.",
      });
      toast.success(
        `${aggregate.createdCount} criados, ${aggregate.skippedCount} pulados e ${aggregate.failedCount} falharam de ${aggregate.attempted} produto(s).`
      );
      if (aggregate.failedCount) {
        toast.error(`${aggregate.failedCount} produtos falharam.`);
      }
      if (routingConfig) {
        toast.success("Rota de checkout criada com os mapas completos.");
      }
      if (aggregate.neutralizedCount) {
        toast.success(`${aggregate.neutralizedCount} produto(s) neutralizados com IA.`);
      }
      if (aggregate.logoAppliedCount) {
        toast.success(`${aggregate.logoAppliedCount} imagem(ns) receberam a logo.`);
      }
      await loadCloneRuns();
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(error instanceof Error ? error.message : "Falha ao aplicar clone.");
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setApplyLoading(false);
    }
  }

  function toggleProductHandle(handle: string, checked: boolean) {
    setSelectedProductHandles((current) => {
      if (checked) return [...new Set([...current, handle])];
      return current.filter((item) => item !== handle);
    });
  }

  // Marca/desmarca apenas o que esta visivel no filtro atual, preservando a
  // selecao de itens escondidos — assim da para montar a selecao categoria por
  // categoria sem perder o que ja foi escolhido.
  function toggleAllProducts(checked: boolean) {
    const visibleHandles = visiblePreview.map((product) => product.handle);
    setSelectedProductHandles((current) => {
      if (checked) return [...new Set([...current, ...visibleHandles])];
      const visibleSet = new Set(visibleHandles);
      return current.filter((handle) => !visibleSet.has(handle));
    });
  }


  return (
    <div className="space-y-5 animate-fade-in">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {pageMeta.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {pageMeta.description}
        </p>
      </header>

      {activeView === "overview" && <ServiceOverview />}

      {activeView === "shopify" && (
      <section className="space-y-4" aria-labelledby="clone-shopify">
        {!isCloneConfigSubpage && (
          <ServiceIntro
            icon={Copy}
            title="Serviço 1: importar produtos da Shopify"
            description="Copie produtos de uma vitrine pública (domínio próprio ou myshopify.com). O assistente abre em um passo a passo: origem, seleção, opções e importação."
            steps={[
              "Escolha individual ou em massa.",
              "Informe a origem e selecione produtos.",
              "Configure opções e importe na sua loja.",
            ]}
          />
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => openImportWizard("single")}
            className="group rounded-lg border border-primary/35 bg-primary/10 p-4 text-left shadow-sm transition-colors hover:border-primary/65 hover:bg-primary/15"
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">
              <PackageCheck className="h-4 w-4" />
              Importar individual
            </span>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Importar produto individual
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Cole a URL de um produto Shopify, configure e publique só aquele
              item.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={() => openImportWizard("bulk")}
            className="group rounded-lg border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/55 hover:bg-card/80"
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-sm font-bold text-foreground">
              <Download className="h-4 w-4 text-primary" />
              Importar em massa
            </span>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Importar em massa
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Leia a loja, selecione vários produtos e importe em lotes com
              progresso.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
        </div>

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
      </section>
      )}

      {activeView === "export" && (
      <section className="space-y-4" aria-labelledby="catalog-export">
        <ServiceIntro
          icon={FileOutput}
          title="Serviço 2: exportar catálogo"
          description="Use quando não quiser aplicar produtos imediatamente. A exportação usa a mesma origem analisada e gera um arquivo para conferência, backup ou importação manual."
          steps={[
            "Preencha a origem Shopify.",
            "Clique em JSON para dados completos.",
            "Clique em CSV para planilha operacional.",
          ]}
        />

        <Card
          id="routed-create-route"
          className="scroll-mt-6 rounded-lg border-border/60"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-4 w-4 text-primary" />
              Loja e arquivos de saída
            </CardTitle>
            <CardDescription>
              Informe aqui a loja pública que será exportada. Não depende da página de clone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-2">
                <Label htmlFor="export-source">Loja para exportar</Label>
                <Input
                  id="export-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="exemplo.myshopify.com ou dominio.com"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Cole o domínio público da loja. O exportador lê <code>/products.json</code> e monta o arquivo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-limit">Limite</Label>
                <Input
                  id="export-limit"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="numeric"
                  min={1}
                  max={MAX_CLONE_LIMIT}
                  type="number"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Quantidade máxima lida da loja. Até {MAX_CLONE_LIMIT}.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">JSON</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Melhor para automações e reimportação completa.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">CSV</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Melhor para revisar preço, SKU e títulos em planilha.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">Origem atual</p>
                <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                  {source || "Nenhuma loja informada"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button variant="outline" onClick={() => handleExport("json")} disabled={Boolean(exportLoading)}>
                {exportLoading === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                Baixar JSON
              </Button>
              <Button variant="outline" onClick={() => handleExport("csv")} disabled={Boolean(exportLoading)}>
                {exportLoading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Baixar CSV
              </Button>
            </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de clone</CardTitle>
            <CardDescription>
              Últimas execuções registradas no Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cloneRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
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
      )}

    </div>
  );
}
