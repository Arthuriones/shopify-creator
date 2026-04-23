"use client";

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
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AliExpressProduct, OptimizationResult } from "@/types";
import Image from "next/image";
import Link from "next/link";
import { ImportCard } from "@/components/products/ImportCard";
import { StoreSettingsCard } from "@/components/products/StoreSettingsCard";
import { PricingCard } from "@/components/products/PricingCard";
import { ImportSummaryCard } from "@/components/products/ImportSummaryCard";
import { LogoCustomizationCard } from "@/components/products/LogoCustomizationCard";
import { EditorFormCard } from "@/components/products/EditorFormCard";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  logo_path: string | null;
  currency_code: string;
  auto_convert_prices: boolean;
  currency_rate: number;
  price_markup_percent: number;
}

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

type LogoPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface PerImageLogoConfig {
  position: LogoPosition;
  scale: number;
  margin: number;
  opacity: number;
  logoPath?: string;
}

interface AvailableLogo {
  path: string;
  label: string;
  url: string;
}

const LOGO_POSITION_OPTIONS: { value: LogoPosition; label: string }[] = [
  { value: "top-left", label: "↖ Topo esq" },
  { value: "top-center", label: "↑ Topo" },
  { value: "top-right", label: "↗ Topo dir" },
  { value: "center-left", label: "← Centro esq" },
  { value: "center", label: "● Centro" },
  { value: "center-right", label: "→ Centro dir" },
  { value: "bottom-left", label: "↙ Inf esq" },
  { value: "bottom-center", label: "↓ Inferior" },
  { value: "bottom-right", label: "↘ Inf dir" },
];

function getLogoUrl(logoPath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/store-logos/${logoPath}`;
}

function CharCounter({ current, max }: { current: number; max: number }) {
  const ratio = current / max;
  const color =
    ratio > 1
      ? "oklch(0.65 0.2 25)"
      : ratio > 0.9
        ? "oklch(0.75 0.15 75)"
        : "oklch(0.55 0.005 260)";
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
  return title.replace(/\s*[-|–]\s*AliExpress.*$/i, "").trim();
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

function formatPrice(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode || "USD"} ${value.toFixed(2)}`;
  }
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

function ProductsPageContent() {
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
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [comparePriceDraft, setComparePriceDraft] = useState("");
  const [bulkMarkupDraft, setBulkMarkupDraft] = useState("0");
  const [activeTab, setActiveTab] = useState("optimized");
  const [storeAssets, setStoreAssets] = useState<StoreAsset[]>([]);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [autoApplyLogoOnImport, setAutoApplyLogoOnImport] = useState(true);

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
    const supabase = createClient();
    setMaterialsLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_assets")
        .select("id, store_id, file_path, label, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Nao foi possivel carregar os materiais da marca.");
        setStoreAssets([]);
        return;
      }

      setStoreAssets(data || []);
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

    const supabase = createClient();
    setMaterialsSaving(true);

    try {
      await ensureStorageBuckets();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nao autenticado");

      const recordsToInsert: { store_id: string; file_path: string; label: string }[] = [];

      for (const [index, file] of materialFiles.entries()) {
        const ext = file.name.split(".").pop() || "png";
        const filePath = `${user.id}/${selectedStore}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("store-assets")
          .upload(filePath, file, { upsert: false });

        if (uploadError) {
          throw new Error(`Erro no upload dos materiais: ${uploadError.message}`);
        }

        recordsToInsert.push({
          store_id: selectedStore,
          file_path: filePath,
          label: file.name,
        });
      }

      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("store_assets")
          .insert(recordsToInsert);

        if (insertError) {
          throw new Error(`Erro ao salvar materiais: ${insertError.message}`);
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

    const supabase = createClient();
    const [{ error: dbError }, { error: storageError }] = await Promise.all([
      supabase.from("store_assets").delete().eq("id", asset.id),
      supabase.storage.from("store-assets").remove([asset.file_path]),
    ]);

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

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche, logo_path, currency_code, auto_convert_prices, currency_rate, price_markup_percent")
        .order("created_at", { ascending: false });
      if (error) {
        const fallback = await supabase
          .from("stores")
          .select("id, name, shop_domain, niche, logo_path")
          .order("created_at", { ascending: false });

        if (fallback.data) {
          setStores(
            fallback.data.map((store) => ({
              ...store,
              currency_code: "USD",
              auto_convert_prices: false,
              currency_rate: 1,
              price_markup_percent: 0,
            }))
          );
          if (storeIdParam && fallback.data.some(s => s.id === storeIdParam)) {
            setSelectedStore(storeIdParam);
          } else if (fallback.data.length === 1) {
            setSelectedStore(fallback.data[0].id);
          }
        }
        return;
      }

      if (data) {
        setStores(data);
        if (storeIdParam && data.some(s => s.id === storeIdParam)) {
          setSelectedStore(storeIdParam);
        } else if (data.length === 1) {
          setSelectedStore(data[0].id);
        }
      }
    }
    loadStores();
  }, [storeIdParam]);

  // Load available logos when store changes
  useEffect(() => {
    if (!selectedStore) {
      setAvailableLogos([]);
      return;
    }

    async function loadLogos() {
      const supabase = createClient();
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

      // Additional logos from store_assets
      const { data: assets } = await supabase
        .from("store_assets")
        .select("id, file_path, label")
        .eq("store_id", selectedStore)
        .order("created_at", { ascending: false });

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
            toast.error("Produto não encontrado.");
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
    setLoading(true);
    setProduct(null);
    setBaseImportedProduct(null);
    setOptimized(null);
    setPublished(false);
    setBrandedImages({});
    setGeneratedImages({});
    setSelectedMainImage(0);

    try {
      const res = await fetch("/api/aliexpress", {
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
        toast.error("O AliExpress retornou uma pagina invalida (404). Use outro link do mesmo produto.");
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
        toast.error("Nao foi possivel importar imagens validas deste anuncio.");
        return;
      }

      if (normalizedProduct.images.length < imported.images.length) {
        toast.warning(
          `${imported.images.length - normalizedProduct.images.length} imagens irrelevantes foram descartadas automaticamente.`
        );
      }

      const activeStore = stores.find((store) => store.id === selectedStore);
      const pricedProduct = applyStorePricingRules(normalizedProduct, activeStore);

      setBaseImportedProduct(normalizedProduct);
      setProduct(pricedProduct);
      const baseTitle = pricedProduct.title.trim();
      const plainDescription = (normalizedProduct.description || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setEditTitle(baseTitle);
      setEditDescription(createDefaultDescriptionHtml(normalizedProduct.description));
      setEditTags("");
      setEditSeoTitle(baseTitle.slice(0, 60));
      setEditSeoDescription(plainDescription.slice(0, 155));
      setActiveTab("optimized");
      if (autoApplyLogoOnImport && selectedStore) {
        const selectedStoreData = stores.find((store) => store.id === selectedStore);
        if (selectedStoreData?.logo_path) {
          void handleBrandAllImages({
            sourceImages: normalizedProduct.images,
            showToast: false,
          });
        }
      }
      const p = normalizedProduct;
      const variantCount = p.variants?.length || 0;
      const optionCount = p.variantOptions?.length || 0;
      toast.success(
        `Produto importado! ${p.images.length} fotos` +
        (variantCount > 0 ? `, ${variantCount} variantes (${optionCount} opções)` : "") +
        `. Preco atual: ${formatPrice(pricedProduct.price, activeStore?.currency_code || "USD")}`
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
          product
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
      toast.error("Erro na comunicação com a IA");
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

      const supabase = createClient();
      await supabase.from("products").insert({
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            Importe do AliExpress, otimize com IA e publique na Shopify
          </p>
        </div>
        <Link
          href="/products/catalog"
          className="inline-flex h-10 items-center rounded-lg border border-border/50 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver Catalogo completo
        </Link>
      </div>

      {/* Config */}
      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-6">
          <StoreSettingsCard 
            stores={stores}
            selectedStore={selectedStore}
            setSelectedStore={(val) => setSelectedStore(val ?? "")}
            selectedStoreData={selectedStoreData}
          />

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

            <ImportCard 
              url={url}
              setUrl={setUrl}
              loading={loading}
              handleScrape={handleScrape}
            />
          </div>
        </CardContent>
      </Card>

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
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4 animate-fade-in"
        >
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="preview" className="text-[13px]">
              Preview Shopify
            </TabsTrigger>
            <TabsTrigger value="original" className="text-[13px]">
              Original
            </TabsTrigger>
            <TabsTrigger value="images" className="text-[13px]">
              Imagens ({product.images.length})
            </TabsTrigger>
            <TabsTrigger
              value="optimized"
              className="text-[13px]"
            >
              Editar
            </TabsTrigger>
          </TabsList>

          {/* TAB: Original */}
          <TabsContent value="original" className="animate-fade-in">
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    {product.images.length > 0 ? (
                      <div className="space-y-2">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/50">
                          <Image
                            src={product.images[selectedMainImage]}
                            alt="Produto principal"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        {product.images.length > 1 && (
                          <div className="grid grid-cols-5 gap-1.5">
                            {product.images.slice(0, 5).map((img, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedMainImage(i)}
                                className={`relative aspect-square overflow-hidden rounded-md border transition-all duration-200 ${
                                  selectedMainImage === i
                                    ? "border-[oklch(0.72_0.19_155)] ring-1 ring-[oklch(0.72_0.19_155)]"
                                    : "border-border/50 hover:border-border"
                                }`}
                              >
                                <Image
                                  src={img}
                                  alt={`Produto ${i + 1}`}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-border/50 bg-card">
                        <Package className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3
                        className="text-lg font-semibold text-foreground"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {product.title}
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge
                          className="text-xs font-medium"
                          style={{
                            background: "oklch(0.72 0.19 155 / 10%)",
                            color: "oklch(0.72 0.19 155)",
                            border: "none",
                          }}
                        >
                          {formatPrice(product.price, activeCurrency)}
                        </Badge>
                        {product.originalPrice > 0 && (
                          <Badge variant="outline" className="text-xs border-border/50">
                            De {formatPrice(product.originalPrice, activeCurrency)}
                          </Badge>
                        )}
                        {product.rating > 0 && (
                          <Badge variant="outline" className="text-xs border-border/50">
                            {product.rating} estrelas
                          </Badge>
                        )}
                        {product.orders > 0 && (
                          <Badge variant="outline" className="text-xs border-border/50">
                            {product.orders} pedidos
                          </Badge>
                        )}
                      </div>
                    </div>

                    {product.description && (
                      <div>
                        <Label className="text-[13px] text-muted-foreground">
                          Descricao original
                        </Label>
                        <p className="mt-1 text-sm text-muted-foreground/80 line-clamp-6 leading-relaxed">
                          {product.description}
                        </p>
                      </div>
                    )}

                    {Object.keys(product.specs).length > 0 && (
                      <div>
                        <Label className="text-[13px] text-muted-foreground">
                          Especificacoes
                        </Label>
                        <div className="mt-1 space-y-1">
                          {Object.entries(product.specs)
                            .slice(0, 5)
                            .map(([key, value]) => (
                              <p
                                key={key}
                                className="text-sm text-muted-foreground/80"
                              >
                                <span className="font-medium text-foreground/70">
                                  {key}:
                                </span>{" "}
                                {value}
                              </p>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Info badges */}
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="text-[11px] text-muted-foreground/60 border-border/30"
                      >
                        {product.images.length} fotos
                      </Badge>
                      {product.variants.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[11px] border-border/30"
                          style={{ color: "oklch(0.72 0.19 155)" }}
                        >
                          <Layers className="mr-1 h-3 w-3" />
                          {product.variants.length} variantes
                        </Badge>
                      )}
                    </div>

                    {/* Variantes */}
                    {product.variantOptions.length > 0 && (
                      <div className="space-y-3 rounded-lg border border-border/30 p-3">
                        <p className="text-[13px] font-medium text-foreground/80">
                          Variantes importadas
                        </p>
                        {product.variantOptions.map((option) => (
                          <div key={option.name} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              {option.name} ({option.values.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {option.values.slice(0, 12).map((val) => (
                                <div
                                  key={val.name}
                                  className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2 py-1 text-[11px]"
                                >
                                  {val.image && (
                                    <Image
                                      src={val.image}
                                      alt={val.name}
                                      width={16}
                                      height={16}
                                      className="rounded-sm object-cover"
                                      unoptimized
                                    />
                                  )}
                                  {val.name}
                                </div>
                              ))}
                              {option.values.length > 12 && (
                                <span className="text-[11px] text-muted-foreground/50 self-center">
                                  +{option.values.length - 12} mais
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Preview Shopify */}
          <TabsContent value="preview" className="animate-fade-in">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle
                  className="text-[13px] font-medium uppercase text-muted-foreground"
                  style={{ letterSpacing: "0.05em" }}
                >
                  Preview completo da pagina de produto
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Visualize como o cliente vera o produto final na Shopify
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50 bg-card">
                      {previewImages[selectedMainImage] ? (
                        <Image
                          src={previewImages[selectedMainImage]}
                          alt={previewTitle}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {previewImages.length > 1 && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {previewImages.slice(0, 10).map((img, index) => (
                          <button
                            key={`${img}-${index}`}
                            type="button"
                            onClick={() => setSelectedMainImage(index)}
                            className={`relative aspect-square overflow-hidden rounded-md border transition-all duration-200 ${
                              selectedMainImage === index
                                ? "border-[oklch(0.72_0.19_155)] ring-1 ring-[oklch(0.72_0.19_155)]"
                                : "border-border/50 hover:border-border"
                            }`}
                          >
                            <Image
                              src={img}
                              alt={`Miniatura ${index + 1}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Badge
                        variant="outline"
                        className="text-[11px] border-border/40"
                      >
                        {selectedStoreName || "Sua loja"}
                      </Badge>
                      <h3
                        className="text-2xl font-semibold text-foreground"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {previewTitle}
                      </h3>
                      <div className="flex items-end gap-2">
                        <span
                          className="text-2xl font-bold"
                          style={{ color: "oklch(0.72 0.19 155)" }}
                        >
                          {formatPrice(previewPrice, activeCurrency)}
                        </span>
                        {previewOriginalPrice > previewPrice && (
                          <span className="text-sm text-muted-foreground/50 line-through">
                            {formatPrice(previewOriginalPrice, activeCurrency)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        ou 12x de {formatPrice(previewPrice / 12, activeCurrency)}
                      </p>
                    </div>

                    {product.variantOptions.length > 0 && (
                      <div className="space-y-3 rounded-lg border border-border/30 p-3">
                        {product.variantOptions.map((option) => (
                          <div key={option.name} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              {option.name}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {option.values.map((value) => {
                                const selected = selectedVariantOptions[option.name] === value.name;
                                return (
                                  <button
                                    key={`${option.name}-${value.name}`}
                                    type="button"
                                    onClick={() =>
                                      setSelectedVariantOptions((prev) => ({
                                        ...prev,
                                        [option.name]: value.name,
                                      }))
                                    }
                                    className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                                      selected
                                        ? "border-[oklch(0.72_0.19_155)] text-[oklch(0.72_0.19_155)]"
                                        : "border-border/40 text-muted-foreground hover:border-border"
                                    }`}
                                  >
                                    {value.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      className="w-full h-11 text-sm font-medium"
                      style={{
                        background: "oklch(0.72 0.19 155)",
                        color: "oklch(0.13 0.02 155)",
                      }}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Comprar agora
                    </Button>

                    <Button
                      onClick={handlePublish}
                      disabled={publishing || !selectedStore || published}
                      className="w-full h-11 text-sm font-medium transition-all duration-200"
                      style={
                        published
                          ? {
                              background: "oklch(0.72 0.19 155 / 15%)",
                              color: "oklch(0.72 0.19 155)",
                            }
                          : {
                              background:
                                publishing || !selectedStore
                                  ? "oklch(0.72 0.19 155 / 30%)"
                                  : "oklch(0.72 0.19 155)",
                              color: "oklch(0.13 0.02 155)",
                            }
                      }
                    >
                      {published ? (
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Salvo na {selectedStoreName || "Shopify"}
                        </span>
                      ) : publishing ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Salvando na Shopify...
                        </span>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Salvar na Shopify
                        </>
                      )}
                    </Button>

                    <div className="grid gap-2 text-xs text-muted-foreground/80">
                      <p className="flex items-center gap-2">
                        <Truck className="h-3.5 w-3.5" />
                        Frete com rastreio para todo Brasil
                      </p>
                      <p className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Compra segura e suporte ao cliente
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border/30 p-4 space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Descricao do produto</h4>
                  {previewDescription ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none text-sm text-muted-foreground/85 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: previewDescription }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground/70">
                      Sem descricao ainda.
                    </p>
                  )}
                </div>

                {Object.keys(product.specs).length > 0 && (
                  <div className="rounded-lg border border-border/30 p-4 space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Especificacoes</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Object.entries(product.specs)
                        .slice(0, 8)
                        .map(([key, value]) => (
                          <div
                            key={key}
                            className="rounded-md border border-border/30 bg-background/30 px-3 py-2 text-xs"
                          >
                            <p className="font-medium text-foreground/80">{key}</p>
                            <p className="mt-1 text-muted-foreground/80">{value}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {previewImages.length > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground">Galeria completa</h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {previewImages.slice(0, 12).map((img, index) => (
                        <button
                          key={`${img}-gallery-${index}`}
                          type="button"
                          onClick={() => setSelectedMainImage(index)}
                          className="relative aspect-square overflow-hidden rounded-md border border-border/40 hover:border-border"
                        >
                          <Image
                            src={img}
                            alt={`Galeria ${index + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Imagens */}
          <TabsContent value="images" className="animate-fade-in">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle
                      className="text-[13px] font-medium uppercase text-muted-foreground"
                      style={{ letterSpacing: "0.05em" }}
                    >
                      Imagens do Produto
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Adicione sua logo ou gere prompts para recriar com IA
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleGenerateAllCleanImages}
                      disabled={generatingAll}
                      size="sm"
                      className="h-9 text-[13px] font-medium transition-all duration-200"
                      style={{
                        background: generatingAll
                          ? "oklch(0.72 0.19 155 / 30%)"
                          : "oklch(0.72 0.19 155)",
                        color: "oklch(0.13 0.02 155)",
                      }}
                    >
                      {generatingAll ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Gerando com IA...
                        </span>
                      ) : (
                        <>
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          Gerar Todas com IA
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => void handleBrandAllImages()}
                      disabled={
                        brandingAll ||
                        !selectedStore ||
                        !stores.find((s) => s.id === selectedStore)?.logo_path
                      }
                      size="sm"
                      variant="outline"
                      className="h-9 text-[13px] font-medium border-border/50"
                    >
                      {brandingAll ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Aplicando ({brandingProgress?.done ?? 0}/{brandingProgress?.total ?? 0})...
                        </span>
                      ) : !stores.find((s) => s.id === selectedStore)?.logo_path ? (
                        "Envie a logo na pagina Lojas"
                      ) : (
                        <>
                          <Stamp className="mr-1.5 h-3.5 w-3.5" />
                          Só Aplicar Logo
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 space-y-3 rounded-lg border border-border/30 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Posicione a logo, ajuste tamanho e opacidade. A transparencia original do arquivo e preservada.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[12px] text-muted-foreground">Posicao da logo</Label>
                      <Select
                        value={logoPosition}
                        onValueChange={(value) => setLogoPosition((value as LogoPosition) ?? "bottom-right")}
                      >
                        <SelectTrigger className="h-9 bg-background/50 border-border/50 text-xs">
                          <SelectValue placeholder="Selecione a posicao" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOGO_POSITION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] text-muted-foreground">
                        Tamanho da logo ({logoScalePercent}% da largura)
                      </Label>
                      <input
                        type="range"
                        min={8}
                        max={40}
                        value={logoScalePercent}
                        onChange={(e) => setLogoScalePercent(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] text-muted-foreground">
                        Margem da borda ({logoMarginPercent}%)
                      </Label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={logoMarginPercent}
                        onChange={(e) => setLogoMarginPercent(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] text-muted-foreground">
                        Opacidade da logo ({logoOpacityPercent}%)
                      </Label>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={logoOpacityPercent}
                        onChange={(e) => setLogoOpacityPercent(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {product.images.map((img, i) => {
                    const generated = generatedImages[img];
                    const branded = brandedImages[img];
                    const displayImg = branded || generated || img;
                    const isGenerating = generatingImage === img;
                    const isBranding = brandingImage === img;
                    const imgConfig = getImageLogoConfig(img);

                    return (
                      <div key={i} className="space-y-2 rounded-lg border border-border/30 p-2" style={{ background: "oklch(0.14 0.005 260 / 50%)" }}>
                        {/* Image preview */}
                        <div className="relative aspect-square overflow-hidden rounded-md border border-border/50">
                          <Image
                            src={displayImg}
                            alt={`Produto ${i + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          {(isGenerating || isBranding) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "oklch(0.09 0.005 260 / 80%)" }}>
                              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "oklch(0.72 0.19 155)" }} />
                              <span className="text-[11px] text-muted-foreground">
                                {isGenerating ? "Gerando com IA..." : "Aplicando logo..."}
                              </span>
                            </div>
                          )}
                          {generated && !branded && !isGenerating && !isBranding && (
                            <div
                              className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{ background: "oklch(0.72 0.19 155 / 90%)", color: "oklch(0.13 0.02 155)" }}
                            >
                              LIMPA COM IA
                            </div>
                          )}
                          {branded && !isGenerating && !isBranding && (
                            <div
                              className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{ background: "oklch(0.80 0.15 80 / 90%)", color: "oklch(0.15 0.02 80)" }}
                            >
                              COM LOGO
                            </div>
                          )}
                        </div>

                        {/* Per-image logo config */}
                        <div className="space-y-1.5">
                          {/* Logo picker + Position */}
                          <div className="grid grid-cols-2 gap-1.5">
                            {availableLogos.length > 0 && (
                              <Select
                                value={imgConfig.logoPath || availableLogos[0]?.path || ""}
                                onValueChange={(val) => updateImageLogoConfig(img, { logoPath: val || undefined })}
                              >
                                <SelectTrigger className="h-7 text-[10px] bg-background/50 border-border/40">
                                  <SelectValue placeholder="Logo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableLogos.map((logo) => (
                                    <SelectItem key={logo.path} value={logo.path} className="text-[11px]">
                                      <span className="flex items-center gap-1.5">
                                        <img src={logo.url} alt="" className="h-4 w-4 object-contain rounded" />
                                        {logo.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Select
                              value={imgConfig.position}
                              onValueChange={(val) => updateImageLogoConfig(img, { position: val as LogoPosition })}
                            >
                              <SelectTrigger className="h-7 text-[10px] bg-background/50 border-border/40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LOGO_POSITION_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Compact sliders */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="text-[9px] text-muted-foreground/70">Tamanho {imgConfig.scale}%</span>
                              <input
                                type="range" min={8} max={40}
                                value={imgConfig.scale}
                                onChange={(e) => updateImageLogoConfig(img, { scale: Number(e.target.value) })}
                                className="w-full h-1 accent-[oklch(0.72_0.19_155)]"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] text-muted-foreground/70">Opacidade {imgConfig.opacity}%</span>
                              <input
                                type="range" min={20} max={100}
                                value={imgConfig.opacity}
                                onChange={(e) => updateImageLogoConfig(img, { opacity: Number(e.target.value) })}
                                className="w-full h-1 accent-[oklch(0.72_0.19_155)]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] border-border/50 px-2 text-red-400 hover:text-red-300 hover:border-red-400/50"
                            onClick={() => handleRemoveImage(img)}
                            disabled={isGenerating || isBranding}
                            title="Remover esta imagem"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] border-border/50 px-2"
                            onClick={() => handleBrandImage(img)}
                            disabled={
                              isGenerating || isBranding || !selectedStore ||
                              (!stores.find((s) => s.id === selectedStore)?.logo_path && availableLogos.length === 0)
                            }
                            title="Aplicar logo nesta imagem"
                          >
                            <Stamp className="h-3 w-3 mr-1" />
                            Logo
                          </Button>
                          {!generated ? (
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-[10px]"
                              disabled={isGenerating || isBranding}
                              onClick={() => handleGenerateCleanImage(img)}
                              title="Usa Gemini AI para reconstruir a foto sem textos ou logos."
                              style={{
                                background: isGenerating || isBranding
                                  ? "oklch(0.72 0.19 155 / 30%)"
                                  : "oklch(0.72 0.19 155)",
                                color: "oklch(0.13 0.02 155)",
                              }}
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Limpar com IA
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-[10px] border-border/50"
                              onClick={async () => {
                                try {
                                  const res = await fetch(generated);
                                  const blob = await res.blob();
                                  const a = document.createElement("a");
                                  a.href = URL.createObjectURL(blob);
                                  a.download = `produto-ai-${i + 1}.png`;
                                  a.click();
                                  URL.revokeObjectURL(a.href);
                                } catch {
                                  window.open(generated, "_blank");
                                }
                              }}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Baixar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] border-border/50 px-2"
                            onClick={() => handleGenerateImagePrompt(img)}
                            title="Gerar prompt para DALL-E/Midjourney"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Otimizado */}
          <TabsContent value="optimized" className="animate-fade-in">
            {product && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Preview */}
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle
                      className="text-[13px] font-medium uppercase text-muted-foreground"
                      style={{ letterSpacing: "0.05em" }}
                    >
                      Preview
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Como vai aparecer na loja
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {product.images.length > 0 && (
                      <div className="space-y-2">
                        <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50">
                          <Image
                            src={brandedImages[product.images[selectedMainImage]] || generatedImages[product.images[selectedMainImage]] || product.images[selectedMainImage]}
                            alt={editTitle}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          {brandedImages[product.images[selectedMainImage]] ? (
                            <div
                              className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: "oklch(0.80 0.15 80 / 90%)",
                                color: "oklch(0.15 0.02 80)",
                              }}
                            >
                              COM LOGO
                            </div>
                          ) : generatedImages[product.images[selectedMainImage]] ? (
                            <div
                              className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: "oklch(0.72 0.19 155 / 90%)",
                                color: "oklch(0.13 0.02 155)",
                              }}
                            >
                              LIMPA COM IA
                            </div>
                          ) : null}
                        </div>
                        {product.images.length > 1 && (
                          <div className="grid grid-cols-5 gap-1.5">
                            {product.images.slice(0, 5).map((img, i) => {
                              const displayThumb = brandedImages[img] || generatedImages[img] || img;
                              return (
                                <button
                                  key={i}
                                  onClick={() => setSelectedMainImage(i)}
                                  className={`relative aspect-square overflow-hidden rounded-md border transition-all duration-200 ${
                                    selectedMainImage === i
                                      ? "border-[oklch(0.72_0.19_155)] ring-1 ring-[oklch(0.72_0.19_155)]"
                                      : "border-border/50 hover:border-border"
                                  }`}
                                >
                                  <Image
                                    src={displayThumb}
                                    alt={`Produto ${i + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                  {(brandedImages[img] || generatedImages[img]) && (
                                    <div
                                      className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full"
                                      style={{ background: brandedImages[img] ? "oklch(0.80 0.15 80)" : "oklch(0.72 0.19 155)" }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <h3
                      className="text-lg font-semibold text-foreground"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {editTitle}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-lg font-bold"
                        style={{ color: "oklch(0.72 0.19 155)" }}
                      >
                        {formatPrice(product.price, activeCurrency)}
                      </span>
                      {product.originalPrice > product.price && (
                        <span className="text-sm text-muted-foreground/50 line-through">
                          {formatPrice(product.originalPrice, activeCurrency)}
                        </span>
                      )}
                    </div>
                    <div
                      className="prose prose-sm prose-invert max-h-60 overflow-auto text-sm text-muted-foreground/80 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: editDescription }}
                    />
                    <div className="flex flex-wrap gap-1">
                      {editTags
                        .split(",")
                        .filter(Boolean)
                        .map((tag) => (
                          <Badge
                            key={tag.trim()}
                            variant="secondary"
                            className="text-[11px]"
                          >
                            {tag.trim()}
                          </Badge>
                        ))}
                    </div>

                    {/* Variantes preview */}
                    {product.variantOptions.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase" style={{ letterSpacing: "0.05em" }}>
                          Variantes ({product.variants.length})
                        </p>
                        {product.variantOptions.map((opt) => (
                          <div key={opt.name} className="flex flex-wrap gap-1">
                            {opt.values.slice(0, 8).map((val) => (
                              <Badge key={val.name} variant="outline" className="text-[10px] border-border/30">
                                {val.name}
                              </Badge>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <EditorFormCard
                  product={product}
                  stores={stores}
                  selectedStore={selectedStore}
                  activeCurrency={activeCurrency}
                  optimizing={optimizing}
                  handleOptimize={handleOptimize}
                  editTitle={editTitle}
                  setEditTitle={setEditTitle}
                  editDescription={editDescription}
                  setEditDescription={setEditDescription}
                  editTags={editTags}
                  setEditTags={setEditTags}
                  editSeoTitle={editSeoTitle}
                  setEditSeoTitle={setEditSeoTitle}
                  editSeoDescription={editSeoDescription}
                  setEditSeoDescription={setEditSeoDescription}
                  variantPriceInputs={variantPriceInputs}
                  handleVariantPriceChange={handleVariantPriceChange}
                  publishing={publishing}
                  published={published}
                  handlePublish={handlePublish}
                  formatPrice={formatPrice}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
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
                    background: "oklch(0.09 0.005 260 / 80%)",
                    color: "oklch(0.55 0.005 260)",
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
                    style={{
                      background: "oklch(0.72 0.19 155)",
                      color: "oklch(0.13 0.02 155)",
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copiar Prompt
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/50">
                  Use no ChatGPT (DALL-E), Midjourney ou Leonardo AI para gerar uma imagem profissional sem logos/watermarks do AliExpress
                </p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[500px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ProductsPageContent />
    </Suspense>
  );
}
