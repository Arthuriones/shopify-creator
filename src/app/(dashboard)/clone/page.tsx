"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Copy,
  Download,
  FileJson,
  FileOutput,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Route,
  SlidersHorizontal,
  Store,
  Trash2,
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
import { ConnectStoresWizard } from "@/components/routed-checkout/connect-stores-wizard";

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

interface CloneApplyProgress {
  phase: "analyzing" | "importing" | "routing" | "done";
  current: number;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  message: string;
}

type CloneView = "overview" | "shopify" | "export" | "routed-checkout";
type CloneMode = "identical" | "translated" | "routed" | "complete" | "custom";
type InventoryMode = "not_tracked" | "tracked";
type ImportMode = "single" | "bulk";
type RoutedCheckoutView =
  | "create-route"
  | "create-destination"
  | "neutralize"
  | "active-routes"
  | "script";

interface ConnectedVariant {
  id: string;
  title: string;
  sku?: string | null;
  price?: string;
  selectedOptions?: { name: string; value: string }[];
}

interface ConnectedProduct {
  id: string;
  title: string;
  handle: string;
  status?: string;
  variants: { nodes: ConnectedVariant[] };
}

interface FlatVariant extends ConnectedVariant {
  productTitle: string;
  productHandle: string;
  label: string;
}

const DEFAULT_SKU_MAP = "{}";

const DEFAULT_VARIANT_MAP = "{}";

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

function safeJsonMap(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function normalizeMatchKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function flattenVariants(products: ConnectedProduct[]): FlatVariant[] {
  return products.flatMap((product) =>
    (product.variants?.nodes || []).map((variant) => {
      const optionText =
        variant.selectedOptions
          ?.map((option) => option.value)
          .filter(Boolean)
          .join(" / ") || variant.title;
      return {
        ...variant,
        productTitle: product.title,
        productHandle: product.handle,
        label: `${product.title}${optionText && optionText !== "Default Title" ? ` - ${optionText}` : ""}`,
      };
    })
  );
}

function buildSuggestedMaps(
  sourceProducts: ConnectedProduct[],
  targetProducts: ConnectedProduct[]
) {
  const sourceVariants = flattenVariants(sourceProducts);
  const targetVariants = flattenVariants(targetProducts);
  const targetBySku = new Map<string, FlatVariant>();
  const targetByLabel = new Map<string, FlatVariant>();

  targetVariants.forEach((variant) => {
    if (variant.sku?.trim()) {
      targetBySku.set(variant.sku.trim().toLowerCase(), variant);
    }
    targetByLabel.set(normalizeMatchKey(variant.label), variant);
  });

  const skuMap: Record<string, string> = {};
  const variantMap: Record<string, string> = {};
  const matches: {
    source: FlatVariant;
    target: FlatVariant;
    reason: "sku" | "titulo";
  }[] = [];
  const unmatched: FlatVariant[] = [];

  sourceVariants.forEach((sourceVariant) => {
    const sku = sourceVariant.sku?.trim();
    const targetVariant = sku
      ? targetBySku.get(sku.toLowerCase())
      : targetByLabel.get(normalizeMatchKey(sourceVariant.label));

    if (targetVariant) {
      if (sku) skuMap[sku] = targetVariant.id;
      variantMap[sourceVariant.id] = targetVariant.id;
      matches.push({
        source: sourceVariant,
        target: targetVariant,
        reason: sku ? "sku" : "titulo",
      });
    } else {
      unmatched.push(sourceVariant);
    }
  });

  return { sourceVariants, targetVariants, skuMap, variantMap, matches, unmatched };
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

function formatJsonMap(map: Record<string, string>) {
  return JSON.stringify(map || {}, null, 2);
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
  const services = [
    {
      href: "/clone/shopify",
      icon: Copy,
      title: "Clonar loja Shopify",
      description:
        "Importe produtos de uma vitrine pública via /products.json, veja a prévia e aplique em uma loja conectada.",
      bullets: ["Origem pública", "Prévia antes de gravar", "Aplicação em loja conectada"],
    },
    {
      href: "/clone/export",
      icon: FileOutput,
      title: "Exportar catálogo",
      description:
        "Gere arquivos JSON ou CSV da origem informada para backup, revisão em planilha ou importação manual.",
      bullets: ["JSON completo", "CSV operacional", "Histórico de execuções"],
    },
    {
      href: "/clone/routed-checkout",
      icon: GitBranch,
      title: "Loja vitrine",
      description:
        "Faça uma vitrine vender enquanto o checkout final é montado na dark store com variantes mapeadas.",
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
  const pathname = usePathname();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState(String(DEFAULT_CLONE_LIMIT));
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("not_tracked");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [cloneMode, setCloneMode] = useState<CloneMode>("identical");
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [translateCloneProducts, setTranslateCloneProducts] = useState(false);
  const [translateVariantOptions, setTranslateVariantOptions] = useState(false);
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
  const [importMode, setImportMode] = useState<ImportMode>("bulk");
  const [selectedImportMode, setSelectedImportMode] = useState<ImportMode | null>(null);
  const [sourceCollections, setSourceCollections] = useState<SourceCollection[]>([]);
  const [selectedProductHandles, setSelectedProductHandles] = useState<string[]>([]);

  const [configs, setConfigs] = useState<CheckoutConfig[]>([]);
  const [cloneRuns, setCloneRuns] = useState<CloneRun[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [routeName, setRouteName] = useState("Vitrine para dark store");
  const [routeSourceStoreId, setRouteSourceStoreId] = useState("");
  const [routeTargetStoreId, setRouteTargetStoreId] = useState("");
  const [routeMode, setRouteMode] = useState("enterprise_static");
  const [skuMap, setSkuMap] = useState(DEFAULT_SKU_MAP);
  const [variantMap, setVariantMap] = useState(DEFAULT_VARIANT_MAP);
  const [editingRouteId, setEditingRouteId] = useState("");
  const [deletingRouteId, setDeletingRouteId] = useState("");
  const [invertingRouteId, setInvertingRouteId] = useState("");
  const [sourceProducts, setSourceProducts] = useState<ConnectedProduct[]>([]);
  const [targetProducts, setTargetProducts] = useState<ConnectedProduct[]>([]);
  const [routeProductsLoading, setRouteProductsLoading] = useState(false);
  const [routeProductsError, setRouteProductsError] = useState("");
  const [routeProductsRefreshKey, setRouteProductsRefreshKey] = useState(0);
  const [appOrigin, setAppOrigin] = useState(getPublicAppUrl());
  const [autofilledMapKey, setAutofilledMapKey] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const cloneAbortRef = useRef<AbortController | null>(null);

  const activeView: CloneView = pathname === "/clone/shopify" || pathname.startsWith("/clone/shopify/")
    ? "shopify"
    : pathname.endsWith("/export")
      ? "export"
      : pathname === "/clone/routed-checkout" || pathname.startsWith("/clone/routed-checkout/")
        ? "routed-checkout"
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
        "Roteie pedidos da vitrine para o checkout da dark store com mapas de SKU e variant.",
    },
  }[activeView];

  const selectedTarget = useMemo(
    () => stores.find((store) => store.id === targetStoreId),
    [stores, targetStoreId]
  );

  const selectedRouteConfig = useMemo(
    () =>
      configs.find(
        (config) =>
          config.source_store_id === routeSourceStoreId &&
          config.target_store_id === routeTargetStoreId &&
          config.enabled
      ) || null,
    [configs, routeSourceStoreId, routeTargetStoreId]
  );

  const suggestedRouteMaps = useMemo(
    () => buildSuggestedMaps(sourceProducts, targetProducts),
    [sourceProducts, targetProducts]
  );

  const manualSourceVariants = useMemo(
    () => suggestedRouteMaps.sourceVariants.slice(0, 40),
    [suggestedRouteMaps.sourceVariants]
  );

  const currentVariantMap = useMemo(
    () => safeJsonMap(variantMap),
    [variantMap]
  );

  const targetVariantById = useMemo(
    () =>
      new Map(
        suggestedRouteMaps.targetVariants.map((variant) => [variant.id, variant])
      ),
    [suggestedRouteMaps.targetVariants]
  );

  const routeLinkRows = useMemo(
    () =>
      manualSourceVariants.map((sourceVariant) => {
        const manualTargetId = currentVariantMap[sourceVariant.id];
        const suggestedMatch = suggestedRouteMaps.matches.find(
          (match) => match.source.id === sourceVariant.id
        );
        const targetVariant = manualTargetId
          ? targetVariantById.get(manualTargetId)
          : suggestedMatch?.target;
        return {
          source: sourceVariant,
          target: targetVariant || null,
          targetId: manualTargetId || suggestedMatch?.target.id || "__none__",
          reason: manualTargetId ? "manual" : suggestedMatch?.reason || "sem-par",
        };
      }),
    [
      currentVariantMap,
      manualSourceVariants,
      suggestedRouteMaps.matches,
      targetVariantById,
    ]
  );

  const routeMapKey = useMemo(
    () =>
      `${routeSourceStoreId}:${routeTargetStoreId}:${suggestedRouteMaps.matches.length}:${suggestedRouteMaps.sourceVariants.length}:${suggestedRouteMaps.targetVariants.length}`,
    [
      routeSourceStoreId,
      routeTargetStoreId,
      suggestedRouteMaps.matches.length,
      suggestedRouteMaps.sourceVariants.length,
      suggestedRouteMaps.targetVariants.length,
    ]
  );

  // Para o passo "Instalar script": usa a rota que casa com as lojas selecionadas;
  // se nenhuma casar, cai para a primeira rota ativa, garantindo um token real.
  const scriptConfig =
    selectedRouteConfig || configs.find((config) => config.enabled) || configs[0] || null;
  const installToken = scriptConfig?.public_token || "";
  function buildRoutedInstallSnippet(token: string) {
    return `<script
  src="${appOrigin}/routed-checkout-loader.js"
  data-token="${token}"
  async>
</script>`;
  }

  const installSnippet = buildRoutedInstallSnippet(
    installToken || "COLE_O_TOKEN_DA_ROTA"
  );

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

  useEffect(() => {
    if (activeView !== "routed-checkout" || !routeSourceStoreId || !routeTargetStoreId) {
      return;
    }

    if (routeSourceStoreId === routeTargetStoreId) {
      setRouteProductsError("Escolha lojas diferentes: a vitrine e a dark store não podem ser a mesma loja.");
      setSourceProducts([]);
      setTargetProducts([]);
      return;
    }

    let cancelled = false;

    async function loadRouteProducts() {
      setRouteProductsLoading(true);
      setRouteProductsError("");
      try {
        const [sourceRes, targetRes] = await Promise.all([
          fetch(`/api/shopify/products?storeId=${routeSourceStoreId}&first=250`),
          fetch(`/api/shopify/products?storeId=${routeTargetStoreId}&first=250`),
        ]);
        const [sourceData, targetData] = await Promise.all([
          sourceRes.json(),
          targetRes.json(),
        ]);

        if (!sourceRes.ok) {
          throw new Error(sourceData.error || "Nao foi possivel carregar produtos da vitrine.");
        }
        if (!targetRes.ok) {
          throw new Error(targetData.error || "Nao foi possivel carregar produtos da dark store.");
        }

        if (!cancelled) {
          setSourceProducts((sourceData.products || []) as ConnectedProduct[]);
          setTargetProducts((targetData.products || []) as ConnectedProduct[]);
        }
      } catch (error) {
        if (!cancelled) {
          setRouteProductsError(
            error instanceof Error ? error.message : "Falha ao carregar produtos reais."
          );
          setSourceProducts([]);
          setTargetProducts([]);
        }
      } finally {
        if (!cancelled) setRouteProductsLoading(false);
      }
    }

    void loadRouteProducts();

    return () => {
      cancelled = true;
    };
  }, [activeView, routeProductsRefreshKey, routeSourceStoreId, routeTargetStoreId]);

  useEffect(() => {
    if (activeView !== "routed-checkout") return;
    if (!routeMapKey || routeMapKey === autofilledMapKey) return;
    if (editingRouteId) return;
    if (suggestedRouteMaps.matches.length === 0) return;

    setSkuMap(formatJsonMap(suggestedRouteMaps.skuMap));
    setVariantMap(formatJsonMap(suggestedRouteMaps.variantMap));
    setAutofilledMapKey(routeMapKey);
  }, [activeView, autofilledMapKey, editingRouteId, routeMapKey, suggestedRouteMaps]);

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
      aiMediaLimit: parseAiMediaLimit(cloneAiMediaLimit),
      genericizeText: cloneGenericizeText,
      neutralizationInstructions: cloneNeutralizationInstructions,
      customPrompt: cloneCustomPrompt,
      applyLogoToImages: applyLogoToCloneImages,
      duplicatePolicy,
      createRoutingConfig,
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
      await Promise.all([loadConfigs(), loadCloneRuns()]);
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

  function toggleAllProducts(checked: boolean) {
    setSelectedProductHandles(checked ? preview.map((product) => product.handle) : []);
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Nao foi possivel copiar ${label}.`);
    }
  }

  function resetRouteForm() {
    setEditingRouteId("");
    setRouteName("Vitrine para dark store");
    setRouteMode("enterprise_static");
    setSkuMap(DEFAULT_SKU_MAP);
    setVariantMap(DEFAULT_VARIANT_MAP);
  }

  async function handleDeleteRoute(config: CheckoutConfig) {
    const confirmed = window.confirm(`Excluir a rota "${config.name}"?`);
    if (!confirmed) return;

    setDeletingRouteId(config.id);
    try {
      const res = await fetch("/api/checkout-routes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: config.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao excluir rota.");
      if (editingRouteId === config.id) resetRouteForm();
      toast.success("Rota excluida.");
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir rota.");
    } finally {
      setDeletingRouteId("");
    }
  }

  async function handleInvertRoute(config: CheckoutConfig) {
    const entries = Object.entries(config.variant_map || {});
    if (entries.length === 0) {
      toast.error("Esta rota nao tem mapa para inverter. Recrie a rota.");
      return;
    }
    const values = entries.map(([, value]) => value);
    if (new Set(values).size !== values.length) {
      toast.error(
        "Nao da para inverter automaticamente (destinos repetidos no mapa). Recrie a rota com a vitrine correta."
      );
      return;
    }

    const confirmed = window.confirm(
      `Inverter "${config.name}"?\n\nA vitrine (onde o cliente compra) e a dark store (onde fica o checkout) serao trocadas. O token instalado no tema continua o mesmo.`
    );
    if (!confirmed) return;

    setInvertingRouteId(config.id);
    try {
      const invertedVariantMap = Object.fromEntries(
        entries.map(([key, value]) => [value, key])
      );
      const res = await fetch("/api/checkout-routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: config.id,
          name: config.name,
          sourceStoreId: config.target_store_id,
          targetStoreId: config.source_store_id,
          mode: config.mode,
          variantMap: invertedVariantMap,
          // sku_map nao pode ser invertido de forma confiavel; o variant_map
          // ja cobre o roteamento. Recriar destino refaz o sku_map se preciso.
          skuMap: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao inverter rota.");
      toast.success("Vitrine e dark store invertidas. O token segue o mesmo.");
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao inverter rota.");
    } finally {
      setInvertingRouteId("");
    }
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
            title="Serviço 1: clonar loja Shopify"
            description="Use quando quiser copiar produtos de uma vitrine pública. A origem pode ser um domínio próprio ou myshopify.com; o sistema busca o catálogo público e mostra uma prévia antes de gravar algo."
            steps={[
              "Informe a loja pública de origem.",
              "Analise a prévia para conferir produtos e variantes.",
              "Aplique na loja conectada ou exporte o catálogo.",
            ]}
          />
        )}

        {!isImportSubpage && !isCloneConfigSubpage && (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => openInlineImport("single")}
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
              Use uma URL de produto Shopify específica, configure destino e publique só aquele item.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={() => openInlineImport("bulk")}
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
              Leia a loja, selecione produtos, veja coleções encontradas e importe em lotes com progresso.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
        </div>
        )}

        {(selectedImportMode || isImportSubpage) && (
          <Card className="rounded-lg border-border/60">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>
                    {isCloneConfigSubpage
                      ? "Configurações de clone"
                      : importMode === "single"
                        ? "Importar produto individual"
                        : "Selecionar produtos para importar"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {isCloneConfigSubpage
                      ? "Ajuste origem, destino, publicação, estoque, IA e seleção antes de importar na Shopify."
                      : "Configure origem, destino, publicação, estoque e seleção antes de gravar na Shopify."}
                  </CardDescription>
                </div>
                {!isImportSubpage && !isCloneConfigSubpage && (
                  <div className="inline-flex rounded-md border border-border bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => openInlineImport("single")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                        importMode === "single"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => openInlineImport("bulk")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                        importMode === "bulk"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Em massa
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="modal-source">
                      {importMode === "single" ? "URL do produto" : "Loja de origem"}
                    </Label>
                    <Input
                      id="modal-source"
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder={
                        importMode === "single"
                          ? "https://loja.com/products/produto"
                          : "exemplo.myshopify.com ou dominio.com"
                      }
                    />
                  </div>
                  {importMode === "bulk" && (
                    <div className="space-y-2">
                      <Label htmlFor="modal-limit">Limite</Label>
                      <Input
                        id="modal-limit"
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
                  <div className="space-y-2">
                    <Label>Destino conectado</Label>
                    <Select value={targetStoreId} onValueChange={(value) => setTargetStoreId(value || "")}>
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
                  <div className="space-y-2">
                    <Label>Duplicados</Label>
                    <Select value={duplicatePolicy} onValueChange={(value) => setDuplicatePolicy(value || "skip")}>
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="skip">Pular existentes</SelectItem>
                        <SelectItem value="create">Criar mesmo assim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={publishToStorefront}
                      onChange={(event) => setPublishToStorefront(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Publicar produto</span>
                      <span className="text-xs text-muted-foreground">Online Store ao importar.</span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={translateCloneProducts}
                      onChange={(event) => setTranslateCloneProducts(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Traduzir produto</span>
                      <span className="text-xs text-muted-foreground">Usa idioma da loja destino.</span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={translateVariantOptions}
                      onChange={(event) => setTranslateVariantOptions(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Traduzir variações</span>
                      <span className="text-xs text-muted-foreground">
                        blue {"->"} azul, S/small {"->"} P.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={neutralizeCloneProducts}
                      onChange={(event) => {
                        setNeutralizeCloneProducts(event.target.checked);
                        if (event.target.checked) {
                          setRemoveExternalReferencesCloneProducts(false);
                        }
                        setCloneMode("custom");
                      }}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <WandSparkles className="h-3.5 w-3.5 text-primary" />
                        Neutralizar produto (stock)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Remove marcas inclusive quando fazem parte do produto.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={removeExternalReferencesCloneProducts}
                      onChange={(event) => {
                        setRemoveExternalReferencesCloneProducts(event.target.checked);
                        if (event.target.checked) {
                          setNeutralizeCloneProducts(false);
                        }
                        setCloneMode("custom");
                      }}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <WandSparkles className="h-3.5 w-3.5 text-primary" />
                        Retirar referencias externas
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Mantem marcas reais do produto e limpa origem/vendedor.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={applyLogoToCloneImages}
                      onChange={(event) => setApplyLogoToCloneImages(event.target.checked)}
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
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={createRoutingConfig}
                      onChange={(event) => setCreateRoutingConfig(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Preparar rota</span>
                      <span className="text-xs text-muted-foreground">Gera mapa para Loja vitrine.</span>
                    </span>
                  </label>
                </div>

                {(neutralizeCloneProducts || removeExternalReferencesCloneProducts) && (
                  <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="clone-ai-media-limit">
                          Midias com IA por produto
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Controle o custo: a IA processa so as primeiras midias; as outras seguem originais.
                        </p>
                      </div>
                      {neutralizeCloneProducts && (
                        <label className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/8 p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={cloneGenericizeText}
                            onChange={(event) => {
                              setCloneGenericizeText(event.target.checked);
                              setCloneMode("custom");
                            }}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="block font-medium text-foreground">
                              Genericizar nome, descricao e SEO
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Ex.: Air Jordan shoes vira Tenis esportivo casual.
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                    <Input
                      id="clone-ai-media-limit"
                      type="number"
                      min={1}
                      max={20}
                      value={cloneAiMediaLimit}
                      onChange={(event) => {
                        setCloneAiMediaLimit(event.target.value);
                        setCloneMode("custom");
                      }}
                      className="h-10 bg-background/70"
                    />
                  </div>
                )}

                {neutralizeCloneProducts && (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/8 p-3">
                    <Label htmlFor="clone-neutralization-instructions">
                      Instruções extras para neutralização
                    </Label>
                    <Textarea
                      id="clone-neutralization-instructions"
                      rows={3}
                      value={cloneNeutralizationInstructions}
                      onChange={(event) => {
                        setCloneNeutralizationInstructions(event.target.value);
                        setCloneMode("custom");
                      }}
                      placeholder="Ex.: remover apenas o patch FIFA, manter o escudo AFA e preservar o padrão azul da camisa."
                      className="bg-background/70 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Vale para os produtos selecionados nesta importação.
                    </p>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
                  <CustomPromptDialog
                    value={cloneCustomPrompt}
                    onChange={(nextPrompt) => {
                      setCloneCustomPrompt(nextPrompt);
                      setCloneMode("custom");
                    }}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vale para os produtos selecionados nesta importacao.
                  </p>
                </div>

                <div className="grid gap-3 rounded-lg border border-border/60 bg-background/45 p-3 md:grid-cols-[1fr_160px]">
                  <div className="space-y-2">
                    <Label>Estoque</Label>
                    <Select
                      value={inventoryMode}
                      onValueChange={(value) => setInventoryMode((value || "not_tracked") as InventoryMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="not_tracked">Inventory not tracked</SelectItem>
                        <SelectItem value="tracked">Definir estoque inicial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      value={inventoryQuantity}
                      onChange={(event) => setInventoryQuantity(event.target.value)}
                      type="number"
                      min={0}
                      disabled={inventoryMode === "not_tracked"}
                    />
                  </div>
                </div>

                {importMode === "bulk" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Produtos da origem
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {preview.length
                            ? `Mostrando ${preview.length}/${parseCloneLimit(limit)} carregados`
                            : "Clique em analisar para carregar a lista."}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={preview.length > 0 && selectedProductHandles.length === preview.length}
                          onChange={(event) => toggleAllProducts(event.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                        Selecionar todos
                      </label>
                    </div>
                    <div className="max-h-80 overflow-auto rounded-lg border border-border/60">
                      {preview.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                          Nenhum produto carregado ainda.
                        </div>
                      ) : (
                        preview.map((product) => (
                          <label
                            key={product.handle}
                            className="grid cursor-pointer grid-cols-[24px_56px_minmax(0,1fr)] gap-3 border-b border-border/50 p-3 last:border-b-0 hover:bg-muted/35"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProductHandles.includes(product.handle)}
                              onChange={(event) =>
                                toggleProductHandle(product.handle, event.target.checked)
                              }
                              className="mt-4 h-4 w-4 accent-primary"
                            />
                            <div className="relative h-14 w-14 overflow-hidden rounded-md border border-border/60 bg-muted">
                              {product.images?.[0]?.src ? (
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
                                {product.variants.length} variante(s) · {product.variants[0]?.price || "0.00"}
                              </p>
                              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                {product.handle}
                              </p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <aside className="space-y-4 border-t border-border/60 bg-muted/25 px-5 py-4 lg:border-l lg:border-t-0">
                {transformedPreview ? (
                  <TransformedPreviewCard preview={transformedPreview} />
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                    Clique em Visualizar para transformar 1 produto com os criterios atuais antes de importar tudo.
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Coleções reconhecidas
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Quando a origem expõe /collections.json, elas aparecem aqui para referência.
                  </p>
                </div>
                {sourceCollections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                    Nenhuma coleção pública carregada.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sourceCollections.slice(0, 20).map((collection) => (
                      <div
                        key={collection.handle}
                        className="rounded-lg border border-border/60 bg-background/55 p-3 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {collection.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            /collections/{collection.handle}
                          </span>
                        </span>
                      </div>
                    ))}
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
                        className="h-full rounded-full bg-primary"
                        style={{
                          width:
                            applyProgress.total > 0
                              ? `${Math.min(100, (applyProgress.current / applyProgress.total) * 100)}%`
                              : "8%",
                        }}
                      />
                    </div>
                  </div>
                )}
              </aside>
            </CardContent>

            <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {importMode === "bulk"
                  ? `${selectedProductHandles.length} produto(s) selecionado(s)`
                  : "Produto individual"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePreview} disabled={previewLoading || !source.trim()}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {importMode === "single" ? "Analisar produto" : "Analisar origem"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTransformPreview}
                  disabled={transformPreviewLoading || !source.trim() || !targetStoreId}
                >
                  {transformPreviewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="h-4 w-4" />
                  )}
                  Visualizar
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={
                    applyLoading ||
                    !source.trim() ||
                    !targetStoreId ||
                    (importMode === "bulk" && preview.length > 0 && selectedProductHandles.length === 0)
                  }
                >
                  {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                  Importar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {null}
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

      {activeView === "routed-checkout" && (
      <section className="space-y-5" aria-labelledby="routed-checkout">
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              <h2
                id="routed-checkout"
                className="text-lg font-semibold text-foreground"
              >
                Loja vitrine para dark store
              </h2>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Conecte duas lojas em poucos cliques: cria os produtos na dark
              store, neutraliza, conecta por SKU e gera o script do checkout
              roteado.
            </p>
          </div>
          <Button
            size="lg"
            className="shrink-0"
            onClick={() => setWizardOpen(true)}
            disabled={stores.length < 2}
          >
            <Route className="h-4 w-4" />
            Conectar lojas
          </Button>
        </div>

        {stores.length < 2 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
            Conecte pelo menos duas lojas (uma vitrine e uma dark store) em{" "}
            <Link href="/stores" className="font-medium underline">
              Lojas conectadas
            </Link>
            .
          </div>
        )}

        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Rotas ativas</CardTitle>
            <CardDescription>
              {configsLoading
                ? "Carregando"
                : `${configs.length} rota(s) - token e script para a vitrine`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
                <Route className="h-6 w-6 text-muted-foreground/70" />
                Nenhuma rota ainda. Clique em &quot;Conectar lojas&quot; para
                criar a primeira.
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => {
                  const routeSnippet = buildRoutedInstallSnippet(
                    config.public_token
                  );
                  return (
                    <div
                      key={config.id}
                      className="rounded-lg border border-border/60 bg-background/45 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground">
                            {config.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatStoreLabel(
                              stores.find(
                                (store) => store.id === config.source_store_id
                              )
                            )}
                            {" -> "}
                            {formatStoreLabel(
                              stores.find(
                                (store) => store.id === config.target_store_id
                              )
                            )}
                            {" - "}
                            {config.enabled ? "ativo" : "pausado"}
                          </p>
                        </div>
                        <Badge
                          variant={config.enabled ? "secondary" : "outline"}
                          className="rounded-md"
                        >
                          {Object.keys(config.sku_map || {}).length +
                            Object.keys(config.variant_map || {}).length}{" "}
                          mapas
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-foreground">
                          Script para colar na vitrine
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(routeSnippet, "script da rota")
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar script
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={routeSnippet}
                        className="mt-2 min-h-24 resize-y font-mono text-xs leading-6"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInvertRoute(config)}
                          disabled={invertingRouteId === config.id}
                          title="Troca vitrine e dark store."
                        >
                          {invertingRouteId === config.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                          )}
                          Inverter lojas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteRoute(config)}
                          disabled={deletingRouteId === config.id}
                        >
                          {deletingRouteId === config.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Excluir
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <ConnectStoresWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          stores={stores}
          appOrigin={appOrigin}
          onRouteCreated={loadConfigs}
        />
      </section>
      )}
    </div>
  );
}
