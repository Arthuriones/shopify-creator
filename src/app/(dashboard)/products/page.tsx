"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AliExpressProduct, OptimizationResult } from "@/types";
import Image from "next/image";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  logo_path: string | null;
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

export default function ProductsPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [product, setProduct] = useState<AliExpressProduct | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [activeTab, setActiveTab] = useState("original");

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
  const [selectedMainImage, setSelectedMainImage] = useState(0);

  // AI generated images
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  async function handleGenerateCleanImage(imageUrl: string) {
    setGeneratingImage(imageUrl);
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

  async function handleBrandAllImages() {
    if (!product || product.images.length === 0) return;
    setBrandingAll(true);
    const results: Record<string, string> = {};

    for (const img of product.images) {
      try {
        const res = await fetch("/api/image/branded", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: img, storeId: selectedStore }),
        });
        if (res.ok) {
          const data = await res.json();
          results[img] = data.url;
        }
      } catch {
        // skip failed images
      }
    }

    setBrandedImages(results);
    setBrandingAll(false);
    const count = Object.keys(results).length;
    if (count > 0) {
      toast.success(`${count} imagens geradas com logo!`);
    }
  }

  async function handleDownloadBranded(originalUrl: string) {
    const imageUrl = brandedImages[originalUrl];
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `produto-branded-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(imageUrl, "_blank");
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

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data } = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche, logo_path")
        .order("created_at", { ascending: false });
      if (data) {
        setStores(data);
        if (data.length === 1) setSelectedStore(data[0].id);
      }
    }
    loadStores();
  }, []);

  useEffect(() => {
    if (optimized) {
      setEditTitle(optimized.title);
      setEditDescription(optimized.description);
      setEditTags(optimized.tags.join(", "));
      setEditSeoTitle(optimized.seoTitle);
      setEditSeoDescription(optimized.seoDescription);
    }
  }, [optimized]);

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setProduct(null);
    setOptimized(null);
    setPublished(false);
    setBrandedImages({});
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

      setProduct(data.product);
      const p = data.product as AliExpressProduct;
      const variantCount = p.variants?.length || 0;
      const optionCount = p.variantOptions?.length || 0;
      toast.success(
        `Produto importado! ${p.images.length} fotos` +
        (variantCount > 0 ? `, ${variantCount} variantes (${optionCount} opções)` : "")
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

    try {
      const res = await fetch("/api/ai/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          storeId: selectedStore,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro na otimizacao");
        return;
      }

      setOptimized(data.result);
      setActiveTab("optimized");
      toast.success("Produto otimizado!");
    } catch {
      toast.error("Erro na otimizacao");
    } finally {
      setOptimizing(false);
    }
  }

  async function handlePublish() {
    if (!product || !selectedStore) {
      toast.error("Selecione uma loja e otimize o produto primeiro");
      return;
    }

    setPublishing(true);

    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/shopify/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          product: {
            title: editTitle,
            descriptionHtml: editDescription,
            tags,
            images: product.images.map((src, i) => ({
              src: generatedImages[src] || brandedImages[src] || src,
              altText: `${editTitle} - ${i + 1}`,
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
              title: editSeoTitle,
              description: editSeoDescription,
            },
          },
        }),
      });

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

      const supabase = createClient();
      await supabase.from("products").insert({
        store_id: selectedStore,
        aliexpress_url: url,
        shopify_product_id: created?.product?.id || null,
        title: editTitle,
        original_title: product.title,
        description: editDescription,
        original_description: product.description || "",
        price: product.price,
        images: product.images.map((src) => generatedImages[src] || brandedImages[src] || src),
        status: "published",
      });

      setPublished(true);
      toast.success(`"${editTitle}" publicado na Shopify!`);
    } catch {
      toast.error("Erro ao publicar produto");
    } finally {
      setPublishing(false);
    }
  }

  const selectedStoreName = stores.find((s) => s.id === selectedStore)?.name;

  return (
    <div className="space-y-8">
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

      {/* Config */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  Loja destino
                </Label>
                {stores.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma loja conectada.{" "}
                    <a href="/stores" className="underline hover:text-foreground transition-colors duration-200">
                      Conectar loja
                    </a>
                  </p>
                ) : (
                  <Select
                    value={selectedStore}
                    onValueChange={(v) => setSelectedStore(v ?? "")}
                  >
                    <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                      <SelectValue placeholder="Selecione a loja" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  Perfil da loja
                </Label>
                {selectedStore ? (
                  (() => {
                    const store = stores.find((s) => s.id === selectedStore);
                    if (!store) return null;
                    return store.niche ? (
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-background/50">
                        <Badge
                          className="text-[11px]"
                          style={{
                            background: "oklch(0.72 0.19 155 / 10%)",
                            color: "oklch(0.72 0.19 155)",
                            border: "none",
                          }}
                        >
                          {store.niche}
                        </Badge>
                        {store.logo_path && (
                          <Badge variant="outline" className="text-[11px] border-border/30">
                            Logo configurada
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-background/50">
                        <p className="text-sm text-muted-foreground">
                          Perfil incompleto.{" "}
                          <a href="/stores" className="underline hover:text-foreground transition-colors">
                            Configurar
                          </a>
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="h-10 flex items-center px-3 rounded-md border border-border/50 bg-background/50">
                    <p className="text-sm text-muted-foreground/50">Selecione uma loja</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Link do AliExpress
              </Label>
              <form onSubmit={handleScrape} className="flex gap-2">
                <Input
                  placeholder="https://aliexpress.com/item/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-10 px-4 text-sm font-medium transition-all duration-200"
                  style={{
                    background: loading
                      ? "oklch(0.72 0.19 155 / 70%)"
                      : "oklch(0.72 0.19 155)",
                    color: "oklch(0.13 0.02 155)",
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="mr-2 h-3.5 w-3.5" />
                      Importar
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <TabsTrigger value="original" className="text-[13px]">
              Original
            </TabsTrigger>
            <TabsTrigger value="images" className="text-[13px]">
              Imagens ({product.images.length})
            </TabsTrigger>
            <TabsTrigger
              value="optimized"
              disabled={!optimized}
              className="text-[13px]"
            >
              Otimizado
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
                          US${product.price.toFixed(2)}
                        </Badge>
                        {product.originalPrice > 0 && (
                          <Badge variant="outline" className="text-xs border-border/50">
                            De US${product.originalPrice.toFixed(2)}
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

                    <Button
                      onClick={handleOptimize}
                      disabled={optimizing || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche}
                      className="w-full h-11 text-sm font-medium transition-all duration-200"
                      style={{
                        background:
                          optimizing || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche
                            ? "oklch(0.72 0.19 155 / 30%)"
                            : "oklch(0.72 0.19 155)",
                        color: "oklch(0.13 0.02 155)",
                      }}
                    >
                      {optimizing ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Otimizando com IA...
                        </span>
                      ) : !selectedStore ? (
                        "Selecione uma loja"
                      ) : !stores.find((s) => s.id === selectedStore)?.niche ? (
                        "Configure o perfil da loja"
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Otimizar com IA
                        </>
                      )}
                    </Button>
                  </div>
                </div>
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
                      onClick={handleBrandAllImages}
                      disabled={brandingAll || !stores.find((s) => s.id === selectedStore)?.logo_path}
                      size="sm"
                      variant="outline"
                      className="h-9 text-[13px] font-medium border-border/50"
                    >
                      {brandingAll ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Aplicando...
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {product.images.map((img, i) => {
                    const generated = generatedImages[img];
                    const branded = brandedImages[img];
                    const displayImg = generated || branded || img;
                    const isGenerating = generatingImage === img;

                    return (
                      <div key={i} className="space-y-2">
                        <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50">
                          <Image
                            src={displayImg}
                            alt={`Produto ${i + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          {isGenerating && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "oklch(0.09 0.005 260 / 80%)" }}>
                              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "oklch(0.72 0.19 155)" }} />
                              <span className="text-[11px] text-muted-foreground">Gerando com IA...</span>
                            </div>
                          )}
                          {generated && !isGenerating && (
                            <div
                              className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: "oklch(0.72 0.19 155 / 90%)",
                                color: "oklch(0.13 0.02 155)",
                              }}
                            >
                              GERADA COM IA
                            </div>
                          )}
                          {!generated && branded && !isGenerating && (
                            <div
                              className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: "oklch(0.80 0.15 80 / 90%)",
                                color: "oklch(0.15 0.02 80)",
                              }}
                            >
                              COM LOGO
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {!generated ? (
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-[11px]"
                              disabled={isGenerating}
                              onClick={() => handleGenerateCleanImage(img)}
                              style={{
                                background: isGenerating
                                  ? "oklch(0.72 0.19 155 / 30%)"
                                  : "oklch(0.72 0.19 155)",
                                color: "oklch(0.13 0.02 155)",
                              }}
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Gerar com IA
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-[11px] border-border/50"
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
                            className="h-8 text-[11px] border-border/50 px-2"
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
            {optimized && (
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
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50">
                        <Image
                          src={generatedImages[product.images[0]] || brandedImages[product.images[0]] || product.images[0]}
                          alt={editTitle}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        {generatedImages[product.images[0]] && (
                          <div
                            className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              background: "oklch(0.72 0.19 155 / 90%)",
                              color: "oklch(0.13 0.02 155)",
                            }}
                          >
                            GERADA COM IA
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
                        US${product.price.toFixed(2)}
                      </span>
                      {product.originalPrice > product.price && (
                        <span className="text-sm text-muted-foreground/50 line-through">
                          US${product.originalPrice.toFixed(2)}
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

                {/* Editor */}
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle
                      className="text-[13px] font-medium uppercase text-muted-foreground"
                      style={{ letterSpacing: "0.05em" }}
                    >
                      Editar
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ajuste antes de publicar
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[13px] text-muted-foreground">
                        Titulo
                      </Label>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                      />
                      <CharCounter current={editTitle.length} max={70} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[13px] text-muted-foreground">
                        Descricao (HTML)
                      </Label>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={8}
                        className="bg-background/50 border-border/50 font-mono text-xs transition-colors duration-200 focus:border-primary/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[13px] text-muted-foreground">
                        Tags (separadas por virgula)
                      </Label>
                      <Input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[13px] text-muted-foreground">
                        SEO Titulo
                      </Label>
                      <Input
                        value={editSeoTitle}
                        onChange={(e) => setEditSeoTitle(e.target.value)}
                        className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                      />
                      <CharCounter current={editSeoTitle.length} max={60} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[13px] text-muted-foreground">
                        SEO Descricao
                      </Label>
                      <Textarea
                        value={editSeoDescription}
                        onChange={(e) => setEditSeoDescription(e.target.value)}
                        rows={2}
                        className="bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                      />
                      <CharCounter
                        current={editSeoDescription.length}
                        max={155}
                      />
                    </div>

                    <Button
                      className="w-full h-11 text-sm font-medium transition-all duration-200"
                      onClick={handlePublish}
                      disabled={publishing || !selectedStore || published}
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
                        <span className="flex items-center gap-2 animate-scale-in">
                          <Check className="h-4 w-4" />
                          Publicado na {selectedStoreName}
                        </span>
                      ) : publishing ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Publicando...
                        </span>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Publicar na {selectedStoreName || "Shopify"}
                          {product.variants.length > 1 && (
                            <span className="ml-1 text-[11px] opacity-70">
                              ({product.variants.length} variantes)
                            </span>
                          )}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
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
