"use client";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Sparkles,
  Upload,
  Check,
  Package,
  ImageIcon,
  Copy,
  Download,
  Layers,
  Stamp,
  Loader2,
  Trash2,
  ShoppingCart,
  ShieldCheck,
  Truck,
  RefreshCw,
  Pencil,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import type { AliExpressProduct, OptimizationResult } from "@/types";
import Image from "next/image";
import Link from "next/link";
import { ImportCard } from "@/components/products/ImportCard";
import { StoreSettingsCard } from "@/components/products/StoreSettingsCard";
import { PricingCard } from "@/components/products/PricingCard";
import { ImportSummaryCard } from "@/components/products/ImportSummaryCard";
import { LogoCustomizationCard } from "@/components/products/LogoCustomizationCard";
import { EditorFormCard } from "@/components/products/EditorFormCard";


interface StoreAsset {
  id: string;
  store_id: string;
  file_path: string;
  label: string | null;
  created_at: string;
}

interface ShopifyCatalogProduct {
  id: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  descriptionHtml: string;
  tags: string[];
  seo?: { title?: string; description?: string } | null;
  images: { nodes: { url: string; altText?: string | null }[] };
  variants: {
    nodes: {
      id: string;
      title: string;
      price: string;
      compareAtPrice?: string | null;
      selectedOptions?: { name: string; value: string }[];
    }[];
  };
  options: { name: string; values: string[] }[];
}


type InventoryMode = "not_tracked" | "tracked";



function getLogoUrl(logoPath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/store-logos/${logoPath}`;
}

function CharCounter({ current, max }: { current: number; max: number }) {
  const ratio = current / max;
  const color =
    ratio > 1
      ? "var(--danger)"
      : ratio > 0.9
        ? "var(--warning)"
        : "var(--muted-foreground)";
  return (
    <p className="text-xs transition-colors duration-200" style={{ color }}>
      {current}/{max}
    </p>
  );
}

function ProductSkeleton() {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-lg" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="skeleton h-6 w-3/4" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-6 w-24 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
              <div className="skeleton h-4 w-2/3" />
            </div>
            <div className="skeleton h-11 w-full rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getAssetUrl(filePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/store-assets/${filePath}`;
}

function isValidImageUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  if (/\b(logo|avatar|icon|placeholder|no_photo|nophoto|flag|country)\b/i.test(url)) return false;
  return true;
}

function normalizeImportedImages(images: string[]): string[] {
  return [...new Set(images.map((image) => image.trim()).filter(isValidImageUrl))];
}

function sanitizeTitle(title: string): string {
  return title.replace(/\s*[-|â€“]\s*AliExpress.*$/i, "").trim();
}

function looksInvalidImportedProduct(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return (
    normalized === "404 page" ||
    normalized.startsWith("404") ||
    normalized.includes("page not found") ||
    normalized.includes("not found")
  );
}

function isMissingPublicationScope(reason: string | undefined): boolean {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  return normalized.includes("read_publications") || normalized.includes("write_publications");
}

function roundPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(value.toFixed(2));
}

function parseNumericInput(value: string): number {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseAiMediaLimit(value: string) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.floor(numeric), 1), 20);
}


function applyMultiplierToProduct(
  source: AliExpressProduct,
  multiplier: number
): AliExpressProduct {
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const apply = (value: number) => roundPrice(value * safeMultiplier);

  return {
    ...source,
    price: apply(source.price || 0),
    originalPrice: apply(source.originalPrice || source.price || 0),
    variants: source.variants.map((variant) => ({
      ...variant,
      price: apply(variant.price || 0),
      originalPrice: apply(variant.originalPrice || variant.price || 0),
    })),
  };
}

function applyStorePricingRules(
  source: AliExpressProduct,
  store: StoreOption | undefined
): AliExpressProduct {
  if (!store || !store.auto_convert_prices) return source;

  const rate = Number(store.currency_rate) > 0 ? Number(store.currency_rate) : 1;
  const markup = Number(store.price_markup_percent) || 0;
  const multiplier = rate * (1 + markup / 100);
  return applyMultiplierToProduct(source, multiplier);
}

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { PickerStore } from "@/lib/stores/picker";
import type { StoreOption, LogoPosition, AvailableLogo } from "./types";
import { formatPrice, LOGO_POSITION_OPTIONS } from "./types";
import type { PerImageLogoConfig } from "./types";

// 950 linhas que so aparecem depois de importar um produto. Sob demanda, elas
// saem do primeiro download da tela.
const ProductEditor = dynamic(
  () => import("./product-editor").then((m) => m.ProductEditor),
  { ssr: false }
);

function ProductsPageContent({ initialStores }: { initialStores: PickerStore[] }) {
  const t = useTranslations("products_page");
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const storeIdParam = searchParams.get("storeId");

  const [isHydrated, setIsHydrated] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [product, setProduct] = useState<AliExpressProduct | null>(null);
  const [variantPriceInputs, setVariantPriceInputs] = useState<Record<string, string>>({});
  const [baseImportedProduct, setBaseImportedProduct] = useState<AliExpressProduct | null>(null);
  const [editingExistingProductId, setEditingExistingProductId] = useState<string | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [stores, setStores] = useState<StoreOption[]>(
    initialStores as unknown as StoreOption[]
  );
  const [selectedStore, setSelectedStore] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [comparePriceDraft, setComparePriceDraft] = useState("");
  const [bulkMarkupDraft, setBulkMarkupDraft] = useState("0");
  const [activeTab, setActiveTab] = useState("optimized");
  const [importSettingsOpen, setImportSettingsOpen] = useState(false);
  const [storeAssets, setStoreAssets] = useState<StoreAsset[]>([]);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [autoApplyLogoOnImport, setAutoApplyLogoOnImport] = useState(true);
  const [neutralizeOnImport, setNeutralizeOnImport] = useState(false);
  const [removeExternalReferencesOnImport, setRemoveExternalReferencesOnImport] =
    useState(false);
  const [aiMediaLimit, setAiMediaLimit] = useState("1");
  const [genericizeNeutralizedText, setGenericizeNeutralizedText] = useState(true);
  const [customImportPrompt, setCustomImportPrompt] = useState("");

  const [catalogProducts, setCatalogProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingCatalogProduct, setEditingCatalogProduct] = useState<ShopifyCatalogProduct | null>(null);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogEditTitle, setCatalogEditTitle] = useState("");
  const [catalogEditDescription, setCatalogEditDescription] = useState("");
  const [catalogEditTags, setCatalogEditTags] = useState("");
  const [catalogEditSeoTitle, setCatalogEditSeoTitle] = useState("");
  const [catalogEditSeoDescription, setCatalogEditSeoDescription] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogOptimizing, setCatalogOptimizing] = useState(false);
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("not_tracked");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editSeoTitle, setEditSeoTitle] = useState("");
  const [editSeoDescription, setEditSeoDescription] = useState("");

  // Image prompt generation
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [imagePromptLoading, setImagePromptLoading] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");

  // Branded images
  const [brandedImages, setBrandedImages] = useState<Record<string, string>>({});
  const [brandingAll, setBrandingAll] = useState(false);
  const [brandingImage, setBrandingImage] = useState<string | null>(null);
  const [brandingProgress, setBrandingProgress] = useState<{ done: number; total: number } | null>(null);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("bottom-right");
  const [logoScalePercent, setLogoScalePercent] = useState(20);
  const [logoMarginPercent, setLogoMarginPercent] = useState(3);
  const [logoOpacityPercent, setLogoOpacityPercent] = useState(100);
  const [selectedMainImage, setSelectedMainImage] = useState(0);
  const [selectedVariantOptions, setSelectedVariantOptions] = useState<Record<string, string>>({});

  // Per-image logo config
  const [imageLogoConfigs, setImageLogoConfigs] = useState<Record<string, PerImageLogoConfig>>({});
  const [availableLogos, setAvailableLogos] = useState<AvailableLogo[]>([]);

  function getImageLogoConfig(imageUrl: string): PerImageLogoConfig {
    return imageLogoConfigs[imageUrl] || {
      position: logoPosition,
      scale: logoScalePercent,
      margin: logoMarginPercent,
      opacity: logoOpacityPercent,
    };
  }

  function updateImageLogoConfig(imageUrl: string, partial: Partial<PerImageLogoConfig>) {
    setImageLogoConfigs((prev) => ({
      ...prev,
      [imageUrl]: { ...getImageLogoConfig(imageUrl), ...partial },
    }));
  }

  // AI generated images
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const materialsInputRef = useRef<HTMLInputElement>(null);

  function createDefaultDescriptionHtml(rawDescription: string | undefined): string {
    const description = (rawDescription || "").trim();
    if (!description) return "<p>Descricao do produto em breve.</p>";

    if (/<[a-z][\s\S]*>/i.test(description)) {
      return description;
    }

    return `<p>${description.replace(/\n+/g, "<br />")}</p>`;
  }

  async function ensureStorageBuckets() {
    const res = await fetch("/api/storage/ensure-buckets", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Nao foi possivel preparar o storage.");
    }
  }

  function toAliExpressProductFromCatalog(item: ShopifyCatalogProduct): AliExpressProduct {
    const firstVariant = item.variants.nodes[0];
    const basePrice = Number(firstVariant?.price || 0);
    const baseCompare = Number(firstVariant?.compareAtPrice || basePrice);

    return {
      title: item.title,
      description: item.descriptionHtml || "",
      price: basePrice,
      originalPrice: baseCompare > basePrice ? baseCompare : basePrice,
      images: item.images.nodes.map((node) => node.url).filter(Boolean),
      specs: {},
      rating: 0,
      orders: 0,
      variantOptions: item.options.map((option) => ({
        name: option.name,
        values: option.values.map((value) => ({ name: value })),
      })),
      variants: item.variants.nodes.map((variant) => ({
        sku: variant.id,
        properties: Object.fromEntries(
          (variant.selectedOptions || []).map((option) => [option.name, option.value])
        ),
        price: Number(variant.price || 0),
        originalPrice: Number(variant.compareAtPrice || variant.price || 0),
        stock: 0,
      })),
    };
  }

  function getShopifyAdminProductUrl(productId: string): string | null {
    const storeDomain = stores.find((store) => store.id === selectedStore)?.shop_domain;
    if (!storeDomain) return null;

    const idMatch = productId.match(/(\d+)$/);
    if (!idMatch?.[1]) return null;
    return `https://${storeDomain}/admin/products/${idMatch[1]}`;
  }

  const loadCatalogProducts = useCallback(async (opts?: { silent?: boolean }) => {
    if (!selectedStore) {
      setCatalogProducts([]);
      return;
    }

    if (opts?.silent) {
      setCatalogRefreshing(true);
    } else {
      setCatalogLoading(true);
    }

    try {
      const params = new URLSearchParams({
        storeId: selectedStore,
        status: "ACTIVE",
        first: "100",
      });

      if (catalogSearch.trim()) {
        params.set("search", catalogSearch.trim());
      }

      const res = await fetch(`/api/shopify/products?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Nao foi possivel carregar produtos ativos.");
        return;
      }

      setCatalogProducts(data.products || []);
    } catch {
      toast.error("Erro ao carregar produtos da loja.");
    } finally {
      setCatalogLoading(false);
      setCatalogRefreshing(false);
    }
  }, [catalogSearch, selectedStore]);

  function openCatalogEditor(productItem: ShopifyCatalogProduct) {
    const converted = toAliExpressProductFromCatalog(productItem);
    setProduct(converted);
    setBaseImportedProduct(converted);
    setEditingExistingProductId(productItem.id);
    
    setEditTitle(productItem.title || "");
    setEditDescription(productItem.descriptionHtml || "");
    setEditTags((productItem.tags || []).join(", "));
    setEditSeoTitle(productItem.seo?.title || productItem.title || "");
    setEditSeoDescription(productItem.seo?.description || "");
    setActiveTab("optimized");
    
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  async function handleSaveCatalogProduct() {
    if (!editingCatalogProduct || !selectedStore) return;
    const title = catalogEditTitle.trim();
    const descriptionHtml = catalogEditDescription.trim();
    if (!title || !descriptionHtml) {
      toast.error("Titulo e descricao sao obrigatorios.");
      return;
    }

    setCatalogSaving(true);
    try {
      const tags = catalogEditTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch("/api/shopify/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          productId: editingCatalogProduct.id,
          updates: {
            title,
            descriptionHtml,
            tags,
            seo: {
              title: catalogEditSeoTitle || title,
              description: catalogEditSeoDescription || title,
            },
            publishToStorefront,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Nao foi possivel salvar produto.");
        return;
      }

      const storefrontPublication = data.result?.storefrontPublication as
        | { ok?: boolean; reason?: string }
        | undefined;

      if (publishToStorefront && storefrontPublication?.ok === false) {
        console.warn("[products.catalogEditor] storefront publish failed", {
          storeId: selectedStore,
          productId: editingCatalogProduct.id,
          reason: storefrontPublication.reason,
        });
        if (isMissingPublicationScope(storefrontPublication.reason)) {
          toast.warning(
            "Produto atualizado, mas faltam scopes de publicacao (read_publications/write_publications). Reinstale o app e reconecte a loja."
          );
        } else {
          toast.warning(
            `Produto atualizado, mas nao foi possivel publicar no storefront: ${storefrontPublication.reason || "erro desconhecido"}`
          );
        }
      } else {
        toast.success("Produto atualizado na Shopify!");
      }

      setCatalogEditorOpen(false);
      await loadCatalogProducts({ silent: true });
    } catch {
      toast.error("Erro ao salvar produto.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleGenerateCleanImage(imageUrl: string) {
    setGeneratingImage(imageUrl);

    // Clear any existing logo so the new clean image takes precedence
    setBrandedImages((prev) => {
      const next = { ...prev };
      delete next[imageUrl];
      return next;
    });

    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          productTitle: editTitle || product?.title || "Produto",
          storeId: selectedStore || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao gerar imagem");
        return;
      }

      const data = await res.json();
      setGeneratedImages((prev) => ({ ...prev, [imageUrl]: data.url }));
      toast.success("Imagem gerada com IA!");
    } catch {
      toast.error("Erro ao gerar imagem com IA");
    } finally {
      setGeneratingImage(null);
    }
  }

  async function handleGenerateAllCleanImages() {
    if (!product || product.images.length === 0) return;
    setGeneratingAll(true);

    for (const img of product.images) {
      if (generatedImages[img]) continue; // skip already generated
      setGeneratingImage(img);
      try {
        const res = await fetch("/api/image/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: img,
            productTitle: editTitle || product?.title || "Produto",
            storeId: selectedStore || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setGeneratedImages((prev) => ({ ...prev, [img]: data.url }));
        }
      } catch {
        // skip failed
      }
    }

    setGeneratingImage(null);
    setGeneratingAll(false);
    toast.success("Imagens geradas com IA!");
  }

  async function applyLogoToImage(
    sourceImageUrl: string,
    originalImageUrl?: string,
    showErrorToast: boolean = true
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    // Use per-image config if available, else global defaults
    const config = originalImageUrl
      ? getImageLogoConfig(originalImageUrl)
      : { position: logoPosition, scale: logoScalePercent, margin: logoMarginPercent, opacity: logoOpacityPercent };

    try {
      const res = await fetch("/api/image/branded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageUrl: sourceImageUrl,
          storeId: selectedStore,
          position: config.position,
          logoScalePercent: config.scale,
          marginPercent: config.margin,
          logoOpacityPercent: config.opacity,
          logoPath: config.logoPath || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (showErrorToast) {
          toast.error(data.error || "Erro ao aplicar logo");
        }
        return null;
      }

      const data = await res.json();
      return typeof data.url === "string" ? data.url : null;
    } catch {
      if (showErrorToast) {
        toast.error("Erro ao aplicar logo");
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handleBrandImage(imageUrl: string) {
    if (!selectedStore) {
      toast.error("Selecione uma loja para aplicar a logo.");
      return;
    }

    // Clear old branded version so we always start from original/AI-cleaned
    setBrandedImages((prev) => {
      const next = { ...prev };
      delete next[imageUrl];
      return next;
    });

    setBrandingImage(imageUrl);
    const sourceImageUrl = generatedImages[imageUrl] || imageUrl;
    const resultUrl = await applyLogoToImage(sourceImageUrl, imageUrl);
    if (resultUrl) {
      setBrandedImages((prev) => ({ ...prev, [imageUrl]: resultUrl }));
      toast.success("Logo aplicada na imagem!");
    }
    setBrandingImage(null);
  }

  function handleRemoveImage(imageUrl: string) {
    if (!product) return;
    const newImages = product.images.filter((img) => img !== imageUrl);
    if (newImages.length === 0) {
      toast.error("O produto precisa de pelo menos 1 imagem.");
      return;
    }
    setProduct({ ...product, images: newImages });
    // Clean up related state
    setBrandedImages((prev) => { const n = { ...prev }; delete n[imageUrl]; return n; });
    setGeneratedImages((prev) => { const n = { ...prev }; delete n[imageUrl]; return n; });
    setImageLogoConfigs((prev) => { const n = { ...prev }; delete n[imageUrl]; return n; });
    if (selectedMainImage >= newImages.length) setSelectedMainImage(0);
    toast.success("Imagem removida.");
  }

  async function handleBrandAllImages(options?: {
    sourceImages?: string[];
    showToast?: boolean;
  }) {
    const imagesToBrand = options?.sourceImages || product?.images || [];
    if (imagesToBrand.length === 0) return;
    if (!selectedStore) {
      toast.error("Selecione uma loja para aplicar a logo.");
      return;
    }

    setBrandingAll(true);
    setBrandingProgress({ done: 0, total: imagesToBrand.length });

    try {
      const results: Record<string, string> = {};
      const queue = [...imagesToBrand];
      const workerCount = Math.min(3, queue.length);

      async function worker() {
        while (queue.length > 0) {
          const img = queue.shift();
          if (!img) break;

          const sourceImageUrl = generatedImages[img] || img;
          const brandedUrl = await applyLogoToImage(sourceImageUrl, img, false);
          if (brandedUrl) {
            results[img] = brandedUrl;
            setBrandedImages((prev) => ({ ...prev, [img]: brandedUrl }));
          }

          setBrandingProgress((prev) =>
            prev
              ? {
                  ...prev,
                  done: Math.min(prev.total, prev.done + 1),
                }
              : prev
          );
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const shouldShowToast = options?.showToast !== false;
      if (shouldShowToast) {
        const count = Object.keys(results).length;
        if (count > 0) {
          toast.success(`${count} imagens com logo atualizadas!`);
        } else {
          toast.error("Nao foi possivel aplicar logo nas imagens.");
        }
      }
    } finally {
      setBrandingAll(false);
      setBrandingProgress(null);
    }
  }

  async function handleGenerateImagePrompt(imageUrl: string) {
    setSelectedImageUrl(imageUrl);
    setImagePromptOpen(true);
    setImagePromptLoading(true);
    setImagePrompt("");

    try {
      const res = await fetch("/api/ai/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          productTitle: product?.title || editTitle || "Produto",
          storeId: selectedStore || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao gerar prompt");
        setImagePromptOpen(false);
        return;
      }

      setImagePrompt(data.prompt);
    } catch {
      toast.error("Erro ao gerar prompt de imagem");
      setImagePromptOpen(false);
    } finally {
      setImagePromptLoading(false);
    }
  }

  function handleCopyPrompt() {
    navigator.clipboard.writeText(imagePrompt);
    toast.success("Prompt copiado!");
  }

  function handleApplyPriceDraft() {
    if (!product) return;

    const nextPrice = parseNumericInput(priceDraft);
    const nextCompare = parseNumericInput(comparePriceDraft);

    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      toast.error("Informe um preco principal valido.");
      return;
    }

    const currentBase = product.price > 0 ? product.price : 1;
    const ratio = nextPrice / currentBase;
    const normalizedCompare =
      Number.isFinite(nextCompare) && nextCompare >= nextPrice
        ? nextCompare
        : nextPrice;

    setProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        price: roundPrice(nextPrice),
        originalPrice: roundPrice(normalizedCompare),
        variants:
          prev.variants.length > 0
            ? prev.variants.map((variant) => {
                const variantBase = variant.price > 0 ? variant.price : nextPrice;
                const variantCompareBase =
                  variant.originalPrice > 0 ? variant.originalPrice : variantBase;
                const adjusted = roundPrice(variantBase * ratio);
                const adjustedCompare = roundPrice(
                  variantCompareBase * ratio
                );
                return {
                  ...variant,
                  price: adjusted,
                  originalPrice: Math.max(adjusted, adjustedCompare),
                };
              })
            : prev.variants,
      };
    });

    toast.success("Preco atualizado no preview e na publicacao.");
  }

  function handleApplyBulkMarkup() {
    if (!product) return;
    const markup = parseNumericInput(bulkMarkupDraft);
    if (!Number.isFinite(markup) || markup <= -100) {
      toast.error("Markup invalido. Use um valor maior que -100.");
      return;
    }

    const factor = 1 + markup / 100;
    setProduct((prev) => (prev ? applyMultiplierToProduct(prev, factor) : prev));
    toast.success("Markup aplicado nas variantes e no preco principal.");
  }

  async function loadStoreAssets(storeId: string) {
    setMaterialsLoading(true);
    try {
      const resposta = await fetch(
        `/api/store-assets?storeId=${encodeURIComponent(storeId)}`
      );
      if (!resposta.ok) {
        toast.error("Não foi possível carregar os materiais da marca.");
        setStoreAssets([]);
        return;
      }
      const dados = await resposta.json();
      setStoreAssets(dados.assets || []);
    } finally {
      setMaterialsLoading(false);
    }
  }

  function handleMaterialsSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ["image/png", "image/webp", "image/jpeg", "image/jpg"];
    const validFiles: File[] = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Formato nao suportado: ${file.name}`);
        continue;
      }

      if (file.size > 6 * 1024 * 1024) {
        toast.error(`Arquivo muito grande (${file.name}). Max 6MB por imagem.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setMaterialFiles((prev) => {
      const next = [...prev, ...validFiles].slice(0, 12);
      if (next.length < prev.length + validFiles.length) {
        toast.error("Limite de 12 materiais por vez.");
      }
      return next;
    });
  }

  async function handleSaveMaterials() {
    if (!selectedStore) {
      toast.error("Selecione uma loja.");
      return;
    }

    if (materialFiles.length === 0) {
      toast.error("Adicione ao menos um material.");
      return;
    }

    setMaterialsSaving(true);

    try {
      // O endpoint grava o arquivo e o registro na mesma chamada, e monta o
      // caminho com o id do usuario, que e o que a policy do bucket exige.
      for (const file of materialFiles) {
        const form = new FormData();
        form.append("storeId", selectedStore);
        form.append("bucket", "store-assets");
        form.append("file", file);
        form.append("label", file.name);
        const resposta = await fetch("/api/store-assets", {
          method: "POST",
          body: form,
        });
        if (!resposta.ok) {
          const dados = await resposta.json().catch(() => ({}));
          throw new Error(dados.error || "Erro no upload dos materiais.");
        }
      }

      await loadStoreAssets(selectedStore);
      setMaterialFiles([]);
      toast.success("Materiais da marca salvos!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar materiais";
      toast.error(message);
    } finally {
      setMaterialsSaving(false);
    }
  }

  async function handleRemoveMaterial(asset: StoreAsset) {
    if (!confirm("Remover este material da marca?")) return;

    const respostaRemocao = await fetch(
      `/api/store-assets?id=${encodeURIComponent(asset.id)}&filePath=${encodeURIComponent(asset.file_path)}`,
      { method: "DELETE" }
    );
    const dbError = respostaRemocao.ok ? null : new Error("falhou");
    const storageError = null;

    if (dbError) {
      toast.error("Nao foi possivel remover o material.");
      return;
    }

    if (storageError) {
      toast.error("Material removido do cadastro, mas houve erro ao excluir arquivo.");
    } else {
      toast.success("Material removido.");
    }

    setStoreAssets((prev) => prev.filter((current) => current.id !== asset.id));
  }

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // A lista já veio do servidor; aqui sobra só escolher qual loja abrir.
  useEffect(() => {
    if (storeIdParam && stores.some((s) => s.id === storeIdParam)) {
      setSelectedStore(storeIdParam);
    } else if (stores.length === 1) {
      setSelectedStore(stores[0].id);
    }
  }, [storeIdParam, stores]);

  // Load available logos when store changes
  useEffect(() => {
    if (!selectedStore) {
      setAvailableLogos([]);
      return;
    }

    async function loadLogos() {
      const logos: AvailableLogo[] = [];

      // Main store logo
      const store = stores.find((s) => s.id === selectedStore);
      if (store?.logo_path) {
        logos.push({
          path: store.logo_path,
          label: "Logo principal",
          url: getLogoUrl(store.logo_path),
        });
      }

      // Logos adicionais, gravados como material com rótulo "logo:".
      const resposta = await fetch(
        `/api/store-assets?storeId=${encodeURIComponent(selectedStore)}`
      );
      const assets = resposta.ok
        ? ((await resposta.json()).assets as { file_path: string; label: string }[])
        : null;

      if (assets) {
        for (const asset of assets) {
          const assetLabel = (asset.label || "").toLowerCase();
          if (assetLabel === "logo" || assetLabel.startsWith("logo")) {
            logos.push({
              path: asset.file_path,
              label: asset.label || "Logo",
              url: getLogoUrl(asset.file_path),
            });
          }
        }
      }

      setAvailableLogos(logos);
    }
    loadLogos();
  }, [selectedStore, stores]);

  useEffect(() => {
    if (!editId || !selectedStore) return;
    
    // Only load if we haven't loaded it yet (prevent infinite reload if store changes)
    if (editingExistingProductId === editId) return;

    async function loadExistingProduct() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shopify/products?storeId=${selectedStore}&search=${encodeURIComponent(`id:${editId}`)}`);
        const data = await res.json();
        if (data.products && data.products.length > 0) {
          openCatalogEditor(data.products[0]);
        } else {
          // If search by ID fails, fallback to loading catalog and finding it
          const resAll = await fetch(`/api/shopify/products?storeId=${selectedStore}&first=50`);
          const dataAll = await resAll.json();
          const found = dataAll.products?.find((p: ShopifyCatalogProduct) => p.id === editId);
          if (found) {
            openCatalogEditor(found);
          } else {
            toast.error("Produto nÃ£o encontrado.");
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("Erro ao buscar produto.");
      } finally {
        setLoading(false);
      }
    }
    loadExistingProduct();
  }, [editId, selectedStore, editingExistingProductId]);

  useEffect(() => {
    if (!selectedStore) {
      setStoreAssets([]);
      setMaterialFiles([]);
      setCatalogProducts([]);
      setCatalogEditorOpen(false);
      setEditingCatalogProduct(null);
      return;
    }

    void loadStoreAssets(selectedStore);
    void loadCatalogProducts();
  }, [loadCatalogProducts, selectedStore]);

  useEffect(() => {
    setPublished(false);
  }, [selectedStore]);

  useEffect(() => {
    if (!selectedStore) return;

    const timer = setTimeout(() => {
      void loadCatalogProducts({ silent: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [catalogSearch, loadCatalogProducts, selectedStore]);

  useEffect(() => {
    if (optimized) {
      setEditTitle(optimized.title);
      setEditDescription(optimized.description);
      setEditTags(optimized.tags.join(", "));
      setEditSeoTitle(optimized.seoTitle);
      setEditSeoDescription(optimized.seoDescription);
    }
  }, [optimized]);


  useEffect(() => {
    if (!product || product.variantOptions.length === 0) {
      setSelectedVariantOptions({});
      return;
    }

    const firstVariant = product.variants[0];
    if (firstVariant?.properties) {
      setSelectedVariantOptions(firstVariant.properties);
      return;
    }

    const fallback: Record<string, string> = {};
    for (const option of product.variantOptions) {
      if (option.values[0]?.name) {
        fallback[option.name] = option.values[0].name;
      }
    }
    setSelectedVariantOptions(fallback);
  }, [product]);

  useEffect(() => {
    if (!product) {
      setSelectedMainImage(0);
      return;
    }

    const availableCount = product.images
      .map((src) => brandedImages[src] || generatedImages[src] || src)
      .filter(isValidImageUrl).length;

    if (availableCount === 0 || selectedMainImage >= availableCount) {
      setSelectedMainImage(0);
    }
  }, [product, generatedImages, brandedImages, selectedMainImage]);

  useEffect(() => {
    if (!product) {
      setPriceDraft("");
      setComparePriceDraft("");
      return;
    }

    setPriceDraft(product.price > 0 ? product.price.toFixed(2) : "");
    setComparePriceDraft(
      product.originalPrice > 0 ? product.originalPrice.toFixed(2) : ""
    );
  }, [product]);

  useEffect(() => {
    if (!baseImportedProduct) return;

    const activeStore = stores.find((store) => store.id === selectedStore);
    const recalculated = applyStorePricingRules(baseImportedProduct, activeStore);
    setProduct(recalculated);

    const initialPrices: Record<string, string> = {};
    recalculated.variants.forEach((v) => {
      initialPrices[v.sku] = v.price.toFixed(2).replace(".", ",");
    });
    setVariantPriceInputs(initialPrices);
  }, [baseImportedProduct, selectedStore, stores]);

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    const cleanupMode = neutralizeOnImport
      ? "stock-neutralize"
      : removeExternalReferencesOnImport
        ? "external-references"
        : null;

    if (cleanupMode && !selectedStore) {
      toast.error("Selecione uma loja para processar as imagens com IA.");
      return;
    }

    setLoading(true);
    setProduct(null);
    setBaseImportedProduct(null);
    setOptimized(null);
    setPublished(false);
    setBrandedImages({});
    setGeneratedImages({});
    setSelectedMainImage(0);

    try {
      const res = await fetch("/api/import/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao buscar produto");
        return;
      }

      const imported = data.product as AliExpressProduct;
      const normalizedProduct: AliExpressProduct = {
        ...imported,
        original_url: url,
        title: sanitizeTitle(imported.title),
        images: normalizeImportedImages(imported.images),
      };

      if (looksInvalidImportedProduct(normalizedProduct.title)) {
        toast.error("A origem retornou uma pagina invalida (404/bloqueio). Use outro link do mesmo produto.");
        return;
      }

      if ((normalizedProduct.price ?? 0) <= 0 && normalizedProduct.variants.length > 0) {
        const variantPrices = normalizedProduct.variants
          .map((variant) => variant.price)
          .filter((price) => price > 0);
        if (variantPrices.length > 0) {
          normalizedProduct.price = Math.min(...variantPrices);
        }
      }

      if ((normalizedProduct.originalPrice ?? 0) <= 0) {
        normalizedProduct.originalPrice = normalizedProduct.price;
      }

      if (normalizedProduct.images.length === 0) {
        toast.error("Nao foi possivel importar imagens validas deste produto.");
        return;
      }

      if (normalizedProduct.images.length < imported.images.length) {
        toast.warning(
          `${imported.images.length - normalizedProduct.images.length} imagens irrelevantes foram descartadas automaticamente.`
        );
      }

      const activeStore = stores.find((store) => store.id === selectedStore);
      let importedForPreview = normalizedProduct;
      let importedOptimization: OptimizationResult | null = null;

      if (cleanupMode) {
        const neutralizeRes = await fetch("/api/product/neutralize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: selectedStore,
            product: normalizedProduct,
            customInstructions: customImportPrompt,
            mode: cleanupMode,
            maxImages: parseAiMediaLimit(aiMediaLimit),
            genericizeText: genericizeNeutralizedText,
          }),
        });
        const neutralizeData = await neutralizeRes.json();

        if (!neutralizeRes.ok) {
          toast.error(
            neutralizeData.error || "Nao foi possivel processar este produto."
          );
          return;
        }

        importedForPreview = neutralizeData.product as AliExpressProduct;
        importedOptimization = {
          title:
            neutralizeData.neutralized?.title || importedForPreview.title || "",
          description:
            neutralizeData.neutralized?.descriptionHtml ||
            importedForPreview.description ||
            "",
          tags: Array.isArray(neutralizeData.neutralized?.tags)
            ? neutralizeData.neutralized.tags
            : [],
          seoTitle:
            neutralizeData.neutralized?.seo?.title ||
            importedForPreview.title ||
            "",
          seoDescription:
            neutralizeData.neutralized?.seo?.description ||
            importedForPreview.description ||
            "",
        };

        const warnings = Array.isArray(neutralizeData.neutralized?.warnings)
          ? neutralizeData.neutralized.warnings
          : [];

        if (warnings.length > 0) {
          toast.warning(
            `Processamento aplicado com ${warnings.length} aviso(s) nas imagens.`
          );
        } else {
          toast.success(
            cleanupMode === "stock-neutralize"
              ? "Produto neutralizado com sucesso."
              : "Referencias externas removidas com sucesso."
          );
        }
      }

      const pricedProduct = applyStorePricingRules(importedForPreview, activeStore);

      setBaseImportedProduct(importedForPreview);
      setProduct(pricedProduct);
      const baseTitle = pricedProduct.title.trim();
      const plainDescription = (importedForPreview.description || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setEditTitle(baseTitle);
      setEditDescription(createDefaultDescriptionHtml(importedForPreview.description));
      setEditTags(importedOptimization?.tags?.join(", ") || "");
      setEditSeoTitle((importedOptimization?.seoTitle || baseTitle).slice(0, 60));
      setEditSeoDescription(
        (importedOptimization?.seoDescription || plainDescription).slice(0, 155)
      );
      setOptimized(importedOptimization);
      setActiveTab("optimized");
      if (autoApplyLogoOnImport && selectedStore) {
        const selectedStoreData = stores.find((store) => store.id === selectedStore);
        if (selectedStoreData?.logo_path) {
          void handleBrandAllImages({
            sourceImages: importedForPreview.images,
            showToast: false,
          });
        }
      }
      const p = importedForPreview;
      const variantCount = p.variants?.length || 0;
      const optionCount = p.variantOptions?.length || 0;
      toast.success(
        `Produto importado! ${p.images.length} fotos` +
        (variantCount > 0 ? `, ${variantCount} variantes (${optionCount} opcoes)` : "") +
        `${
          cleanupMode === "stock-neutralize"
            ? ", neutralizado"
            : cleanupMode === "external-references"
              ? ", referencias externas removidas"
              : ""
        }. Preco atual: ${formatPrice(
          pricedProduct.price,
          activeStore?.currency_code || "USD"
        )}`
      );
    } catch {
      toast.error("Erro ao buscar produto");
    } finally {
      setLoading(false);
    }
  }
  async function handleOptimize() {
    if (!product) return;
    if (!selectedStore) {
      toast.error("Selecione uma loja primeiro");
      return;
    }

    const store = stores.find((s) => s.id === selectedStore);
    if (!store?.niche) {
      toast.error("Configure o perfil da loja antes de otimizar");
      return;
    }

    setOptimizing(true);
    toast.info("Otimizando produto com IA... Isso pode levar alguns segundos.");

    try {
      const res = await fetch("/api/product/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          product,
          customPrompt: customImportPrompt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao otimizar produto");
        setOptimizing(false);
        return;
      }

      setOptimized(data.optimized);
      setActiveTab("optimized");
      toast.success("Produto otimizado com sucesso!");
    } catch {
      toast.error("Erro na comunicaÃ§Ã£o com a IA");
    } finally {
      setOptimizing(false);
    }
  }

  const handleVariantPriceChange = (sku: string, newPriceRaw: string) => {
    setVariantPriceInputs(prev => ({ ...prev, [sku]: newPriceRaw }));
    const newPrice = parseFloat(newPriceRaw.replace(",", "."));
    if (isNaN(newPrice)) return;
    if (product) {
      setProduct({
        ...product,
        variants: product.variants.map((v) =>
          v.sku === sku ? { ...v, price: newPrice } : v
        ),
      });
    }
  };

  async function handlePublish() {
    if (!product || !selectedStore) {
      toast.error("Selecione uma loja e importe um produto.");
      return;
    }

    const publishTitle = (editTitle || product.title).trim();
    const publishDescriptionHtml = (editDescription || product.description || "").trim();
    if (!publishTitle) {
      toast.error("Informe um titulo antes de publicar.");
      return;
    }
    if (!publishDescriptionHtml) {
      toast.error("Informe uma descricao antes de publicar.");
      return;
    }

    setPublishing(true);

    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const inventoryQuantityValue = Math.max(
      0,
      Math.floor(Number(inventoryQuantity || 0))
    );
    const inventoryVariantSettings = {
      inventoryTracked: inventoryMode === "tracked",
      ...(inventoryMode === "tracked" && Number.isFinite(inventoryQuantityValue)
        ? { inventoryQuantity: inventoryQuantityValue }
        : {}),
    };

    try {
      let res;
      if (editingExistingProductId) {
        res = await fetch("/api/shopify/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: selectedStore,
            productId: editingExistingProductId,
            updates: {
              title: publishTitle,
              descriptionHtml: publishDescriptionHtml,
              tags,
              images: product.images.map((src, i) => ({
                src: brandedImages[src] || generatedImages[src] || src,
                altText: `${publishTitle} - ${i + 1}`,
              })),
              seo: {
                title: editSeoTitle || publishTitle,
                description: editSeoDescription || publishTitle,
              },
              publishToStorefront,
            },
          }),
        });
      } else {
        res = await fetch("/api/shopify/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: selectedStore,
            product: {
              title: publishTitle,
              descriptionHtml: publishDescriptionHtml,
              tags,
              images: product.images.map((src, i) => ({
                src: brandedImages[src] || generatedImages[src] || src,
                altText: `${publishTitle} - ${i + 1}`,
              })),
              ...(product.variants.length > 1 && product.variantOptions.length > 0
                ? {
                    options: product.variantOptions.map((o) => o.name),
                    variants: product.variants.map((v) => ({
                      price: v.price.toFixed(2),
                      compareAtPrice:
                        v.originalPrice > v.price
                          ? v.originalPrice.toFixed(2)
                          : undefined,
                      options: product.variantOptions.map(
                        (o) => v.properties[o.name] || ""
                      ),
                      ...inventoryVariantSettings,
                    })),
                  }
                : {
                    variants: [
                      {
                        price: product.price.toFixed(2),
                        compareAtPrice:
                          product.originalPrice > product.price
                            ? product.originalPrice.toFixed(2)
                            : undefined,
                        ...inventoryVariantSettings,
                      },
                    ],
                  }),
              seo: {
                title: editSeoTitle || publishTitle,
                description: editSeoDescription || publishTitle,
              },
              publishToStorefront,
            },
          }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao publicar");
        return;
      }

      const created = data.result?.productCreate;
      if (created?.userErrors?.length > 0) {
        toast.error(created.userErrors[0].message);
        return;
      }

      const storefrontPublication = data.result?.storefrontPublication as
        | { ok?: boolean; reason?: string }
        | undefined;

      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: selectedStore,
          aliexpress_url: url,
          shopify_product_id: created?.product?.id || null,
          title: publishTitle,
          original_title: product.title,
          description: publishDescriptionHtml,
          original_description: product.description || "",
          price: product.price,
          images: product.images.map((src) => brandedImages[src] || generatedImages[src] || src),
          status: publishToStorefront ? "published" : "optimized",
        }),
      });

      setPublished(true);
      if (publishToStorefront && storefrontPublication?.ok === false) {
        console.warn("[products.importPublish] storefront publish failed", {
          storeId: selectedStore,
          productTitle: publishTitle,
          reason: storefrontPublication.reason,
        });
        if (isMissingPublicationScope(storefrontPublication.reason)) {
          toast.warning(
            "Produto criado, mas faltam scopes de publicacao (read_publications/write_publications). Reinstale o app e reconecte a loja."
          );
        } else {
          toast.warning(
            `Produto criado, mas nao foi possivel publicar no storefront: ${storefrontPublication.reason || "erro desconhecido"}`
          );
        }
      } else if (publishToStorefront) {
        toast.success(`"${publishTitle}" publicado na Shopify e visivel na loja!`);
      } else {
        toast.success(`"${publishTitle}" salvo na Shopify como rascunho.`);
      }
    } catch {
      toast.error("Erro ao publicar produto");
    } finally {
      setPublishing(false);
    }
  }

  const selectedStoreData = stores.find((s) => s.id === selectedStore);
  const selectedStoreName = selectedStoreData?.name;
  const activeCurrency = selectedStoreData?.currency_code || "USD";
  const previewTitle = editTitle || product?.title || "";
  const previewDescription = editDescription || product?.description || "";
  const previewImages = product
    ? product.images
      .map((src) => brandedImages[src] || generatedImages[src] || src)
      .filter(isValidImageUrl)
    : [];
  const selectedVariant = product?.variants.find((variant) =>
    Object.entries(selectedVariantOptions).every(
      ([key, value]) => variant.properties[key] === value
    )
  );
  const previewPrice = selectedVariant?.price ?? product?.price ?? 0;
  const previewOriginalPrice =
    selectedVariant?.originalPrice ?? product?.originalPrice ?? previewPrice;

  if (!isHydrated) {
    return (
      <div className="space-y-6">
        <div>
          <h2
            className="text-3xl font-semibold text-foreground"
            style={{ letterSpacing: "-0.03em" }}
          >
            Produtos
          </h2>
          <p
            className="mt-1 text-base text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Carregando...
          </p>
        </div>
        <ProductSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-2xl font-semibold text-foreground"
            style={{ letterSpacing: "-0.03em" }}
          >
            Produtos
          </h2>
          <p
            className="mt-1 text-sm text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Importe produtos de qualquer site, otimize com IA e publique na Shopify
          </p>
        </div>
      </div>

      {/* Config */}
      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[240px] flex-1">
              <StoreSettingsCard
                stores={stores}
                selectedStore={selectedStore}
                setSelectedStore={(val) => setSelectedStore(val ?? "")}
                selectedStoreData={selectedStoreData}
              />
            </div>
            <button
              type="button"
              onClick={() => setImportSettingsOpen(true)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border/50 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Configurações de importação
            </button>
          </div>

          <ImportCard
            url={url}
            setUrl={setUrl}
            loading={loading}
            handleScrape={handleScrape}
            neutralizeOnImport={neutralizeOnImport}
            setNeutralizeOnImport={setNeutralizeOnImport}
            removeExternalReferencesOnImport={removeExternalReferencesOnImport}
            setRemoveExternalReferencesOnImport={setRemoveExternalReferencesOnImport}
            aiMediaLimit={aiMediaLimit}
            setAiMediaLimit={setAiMediaLimit}
            genericizeNeutralizedText={genericizeNeutralizedText}
            setGenericizeNeutralizedText={setGenericizeNeutralizedText}
            customPrompt={customImportPrompt}
            setCustomPrompt={setCustomImportPrompt}
            hasSelectedStore={Boolean(selectedStore)}
          />
        </CardContent>
      </Card>

      {/* Popup: configurações avançadas de importação */}
      <Dialog open={importSettingsOpen} onOpenChange={setImportSettingsOpen}>
        <DialogContent className="border-border/50 bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurações de importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publishToStorefront}
                  onChange={(e) => setPublishToStorefront(e.target.checked)}
                  className="h-4 w-4 rounded border-border/70 bg-background"
                />
                <span className="text-foreground/90">
                  Inserir automaticamente na loja (canal Online Store)
                </span>
              </label>
              <p className="mt-1 pl-6 text-xs text-muted-foreground/80">
                Marcado: publica ativo e disponivel no storefront. Desmarcado: salva como rascunho.
              </p>
            </div>
            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-3">
              <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/90">
                    Estoque ao criar produto
                  </p>
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
                  <p className="text-xs text-muted-foreground/80">
                    Com Inventory not tracked, a Shopify nao recebe quantidade e o produto nao nasce com estoque 0.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/90">Quantidade</p>
                  <Input
                    type="number"
                    min={0}
                    value={inventoryQuantity}
                    onChange={(event) => setInventoryQuantity(event.target.value)}
                    disabled={inventoryMode === "not_tracked"}
                    className="h-10 bg-background/50 border-border/50"
                  />
                  <p className="text-xs text-muted-foreground/80">
                    Usada somente no modo rastreado.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoApplyLogoOnImport}
                  onChange={(e) => setAutoApplyLogoOnImport(e.target.checked)}
                  className="h-4 w-4 rounded border-border/70 bg-background"
                />
                <span className="text-foreground/90">
                  Aplicar logo automaticamente apos importar
                </span>
              </label>
              <p className="mt-1 pl-6 text-xs text-muted-foreground/80">
                Se a loja tiver logo configurada, todas as midias vao para o preview ja com marca.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {product && (
        <PricingCard 
          product={product}
          setProduct={setProduct}
          baseImportedProduct={baseImportedProduct}
          selectedStoreData={selectedStoreData}
          activeCurrency={activeCurrency}
          priceDraft={priceDraft}
          setPriceDraft={setPriceDraft}
          comparePriceDraft={comparePriceDraft}
          setComparePriceDraft={setComparePriceDraft}
          bulkMarkupDraft={bulkMarkupDraft}
          setBulkMarkupDraft={setBulkMarkupDraft}
          handleApplyPriceDraft={handleApplyPriceDraft}
          handleApplyBulkMarkup={handleApplyBulkMarkup}
          applyStorePricingRules={applyStorePricingRules}
          setVariantPriceInputs={setVariantPriceInputs}
        />
      )}


      {product && (
        <ImportSummaryCard 
          product={product}
          previewDescription={previewDescription}
        />
      )}

      {product && (
        <LogoCustomizationCard 
          logoPosition={logoPosition}
          setLogoPosition={setLogoPosition}
          logoScalePercent={logoScalePercent}
          setLogoScalePercent={setLogoScalePercent}
          logoMarginPercent={logoMarginPercent}
          setLogoMarginPercent={setLogoMarginPercent}
          logoOpacityPercent={logoOpacityPercent}
          setLogoOpacityPercent={setLogoOpacityPercent}
          brandingAll={brandingAll}
          brandingProgress={brandingProgress}
          handleBrandAllImages={handleBrandAllImages}
          selectedStore={selectedStore}
          stores={stores}
        />
      )}

      {/* Loading skeleton */}
      {loading && !product && <ProductSkeleton />}

      {/* Product */}
      {product && (
        <ProductEditor
          activeCurrency={activeCurrency}
          activeTab={activeTab}
          availableLogos={availableLogos}
          brandedImages={brandedImages}
          brandingAll={brandingAll}
          brandingImage={brandingImage}
          brandingProgress={brandingProgress}
          editDescription={editDescription}
          editSeoDescription={editSeoDescription}
          editSeoTitle={editSeoTitle}
          editTags={editTags}
          editTitle={editTitle}
          generatedImages={generatedImages}
          generatingAll={generatingAll}
          generatingImage={generatingImage}
          getImageLogoConfig={getImageLogoConfig}
          handleBrandAllImages={handleBrandAllImages}
          handleBrandImage={handleBrandImage}
          handleGenerateAllCleanImages={handleGenerateAllCleanImages}
          handleGenerateCleanImage={handleGenerateCleanImage}
          handleGenerateImagePrompt={handleGenerateImagePrompt}
          handleOptimize={handleOptimize}
          handlePublish={handlePublish}
          handleRemoveImage={handleRemoveImage}
          handleVariantPriceChange={handleVariantPriceChange}
          logoMarginPercent={logoMarginPercent}
          logoOpacityPercent={logoOpacityPercent}
          logoPosition={logoPosition}
          logoScalePercent={logoScalePercent}
          optimized={optimized}
          optimizing={optimizing}
          previewDescription={previewDescription}
          previewImages={previewImages}
          previewOriginalPrice={previewOriginalPrice}
          previewPrice={previewPrice}
          previewTitle={previewTitle}
          product={product}
          published={published}
          publishing={publishing}
          selectedMainImage={selectedMainImage}
          selectedStore={selectedStore}
          selectedStoreName={selectedStoreName}
          selectedVariantOptions={selectedVariantOptions}
          setActiveTab={setActiveTab}
          setEditDescription={setEditDescription}
          setEditSeoDescription={setEditSeoDescription}
          setEditSeoTitle={setEditSeoTitle}
          setEditTags={setEditTags}
          setEditTitle={setEditTitle}
          setLogoMarginPercent={setLogoMarginPercent}
          setLogoOpacityPercent={setLogoOpacityPercent}
          setLogoPosition={setLogoPosition}
          setLogoScalePercent={setLogoScalePercent}
          setSelectedMainImage={setSelectedMainImage}
          setSelectedVariantOptions={setSelectedVariantOptions}
          stores={stores}
          t={t}
          updateImageLogoConfig={updateImageLogoConfig}
          variantPriceInputs={variantPriceInputs}
        />
      )}


      {/* Image prompt dialog */}
      <Dialog open={imagePromptOpen} onOpenChange={setImagePromptOpen}>
        <DialogContent className="border-border/50 bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              Gerar Imagem com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedImageUrl && (
              <div className="relative aspect-video overflow-hidden rounded-lg border border-border/50">
                <Image
                  src={selectedImageUrl}
                  alt="Imagem original"
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div
                  className="absolute top-2 left-2 px-2 py-1 rounded text-[11px] font-medium"
                  style={{
                    background: "color-mix(in oklch, var(--background) 80%, transparent)",
                    color: "var(--muted-foreground)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  Original
                </div>
              </div>
            )}

            {imagePromptLoading ? (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analisando imagem e gerando prompt...</p>
              </div>
            ) : imagePrompt ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-background/50 border border-border/30 p-4">
                  <p className="text-sm text-muted-foreground/80 leading-relaxed font-mono">
                    {imagePrompt}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyPrompt}
                    className="h-9 text-[13px] font-medium flex-1 transition-all duration-200"
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copiar Prompt
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/50">
                  Use no ChatGPT (DALL-E), Midjourney ou Leonardo AI para gerar uma imagem profissional sem logos, marcas d&apos;agua ou referencias da origem
                </p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductsScreen({ initialStores }: { initialStores: PickerStore[] }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[500px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ProductsPageContent initialStores={initialStores} />
    </Suspense>
  );
}

