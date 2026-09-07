"use client";

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
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { StoreOption, LogoPosition, AvailableLogo, PerImageLogoConfig } from "./types";
import { formatPrice, LOGO_POSITION_OPTIONS } from "./types";

/**
 * O editor do produto importado.
 *
 * Mora em modulo proprio para NAO entrar no primeiro download da tela: sao
 * 950 linhas que so aparecem depois que alguem importa um produto. O pai
 * carrega isto sob demanda com next/dynamic.
 */
export interface ProductEditorProps {
  activeCurrency: string;
  activeTab: string;
  availableLogos: AvailableLogo[];
  brandedImages: Record<string, string>;
  brandingAll: boolean;
  brandingImage: string | null;
  brandingProgress: { done: number; total: number } | null;
  editDescription: string;
  editSeoDescription: string;
  editSeoTitle: string;
  editTags: string;
  editTitle: string;
  generatedImages: Record<string, string>;
  generatingAll: boolean;
  generatingImage: string | null;
  getImageLogoConfig: (imageUrl: string) => PerImageLogoConfig;
  handleBrandAllImages: (options?: { sourceImages?: string[]; showToast?: boolean }) => void | Promise<void>;
  handleBrandImage: (imageUrl: string) => void | Promise<void>;
  handleGenerateAllCleanImages: () => void | Promise<void>;
  handleGenerateCleanImage: (imageUrl: string) => void | Promise<void>;
  handleGenerateImagePrompt: (imageUrl: string) => void | Promise<void>;
  handleOptimize: () => void | Promise<void>;
  handlePublish: () => void | Promise<void>;
  handleRemoveImage: (imageUrl: string) => void;
  handleVariantPriceChange: (sku: string, newPriceRaw: string) => void;
  logoMarginPercent: number;
  logoOpacityPercent: number;
  logoPosition: LogoPosition;
  logoScalePercent: number;
  optimized: OptimizationResult | null;
  optimizing: boolean;
  previewDescription: string;
  previewImages: string[];
  previewOriginalPrice: number;
  previewPrice: number;
  previewTitle: string;
  product: AliExpressProduct;
  published: boolean;
  publishing: boolean;
  selectedMainImage: number;
  selectedStore: string;
  selectedStoreName: string | undefined;
  selectedVariantOptions: Record<string, string>;
  setActiveTab: (v: string) => void;
  setEditDescription: (v: string) => void;
  setEditSeoDescription: (v: string) => void;
  setEditSeoTitle: (v: string) => void;
  setEditTags: (v: string) => void;
  setEditTitle: (v: string) => void;
  setLogoMarginPercent: (v: number) => void;
  setLogoOpacityPercent: (v: number) => void;
  setLogoPosition: (v: LogoPosition) => void;
  setLogoScalePercent: (v: number) => void;
  setSelectedMainImage: (v: number) => void;
  setSelectedVariantOptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  stores: StoreOption[];
  t: (k: string) => string;
  updateImageLogoConfig: (imageUrl: string, partial: Partial<PerImageLogoConfig>) => void;
  variantPriceInputs: Record<string, string>;
}

export function ProductEditor({
  activeCurrency,
  activeTab,
  availableLogos,
  brandedImages,
  brandingAll,
  brandingImage,
  brandingProgress,
  editDescription,
  editSeoDescription,
  editSeoTitle,
  editTags,
  editTitle,
  generatedImages,
  generatingAll,
  generatingImage,
  getImageLogoConfig,
  handleBrandAllImages,
  handleBrandImage,
  handleGenerateAllCleanImages,
  handleGenerateCleanImage,
  handleGenerateImagePrompt,
  handleOptimize,
  handlePublish,
  handleRemoveImage,
  handleVariantPriceChange,
  logoMarginPercent,
  logoOpacityPercent,
  logoPosition,
  logoScalePercent,
  optimized,
  optimizing,
  previewDescription,
  previewImages,
  previewOriginalPrice,
  previewPrice,
  previewTitle,
  product,
  published,
  publishing,
  selectedMainImage,
  selectedStore,
  selectedStoreName,
  selectedVariantOptions,
  setActiveTab,
  setEditDescription,
  setEditSeoDescription,
  setEditSeoTitle,
  setEditTags,
  setEditTitle,
  setLogoMarginPercent,
  setLogoOpacityPercent,
  setLogoPosition,
  setLogoScalePercent,
  setSelectedMainImage,
  setSelectedVariantOptions,
  stores,
  t,
  updateImageLogoConfig,
  variantPriceInputs,
}: ProductEditorProps) {
  return (
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
                                  ? "border-[var(--action)] ring-1 ring-[var(--action)]"
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
                          background: "color-mix(in oklch, var(--action) 10%, transparent)",
                          color: "var(--action)",
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
                        {t("original_description")}
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground/80 line-clamp-6 leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  )}

                  {Object.keys(product.specs).length > 0 && (
                    <div>
                      <Label className="text-[13px] text-muted-foreground">
                        {t("original_specs")}
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
                        style={{ color: "var(--action)" }}
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
                              ? "border-[var(--action)] ring-1 ring-[var(--action)]"
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
                        style={{ color: "var(--action)" }}
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
                                      ? "border-[var(--action)] text-[var(--action)]"
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
                            background: "color-mix(in oklch, var(--action) 15%, transparent)",
                            color: "var(--action)",
                          }
                        : {
                            background:
                              publishing || !selectedStore
                                ? "color-mix(in oklch, var(--action) 30%, transparent)"
                                : "var(--action)",
                            color: "var(--action-foreground)",
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
                  <h4 className="text-sm font-medium text-foreground">{t("original_specs")}</h4>
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
                        ? "color-mix(in oklch, var(--action) 30%, transparent)"
                        : "var(--action)",
                      color: "var(--action-foreground)",
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
                        SÃ³ Aplicar Logo
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
                    <div key={i} className="space-y-2 rounded-lg border border-border/30 p-2" style={{ background: "color-mix(in oklch, var(--background) 50%, transparent)" }}>
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
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "color-mix(in oklch, var(--background) 80%, transparent)" }}>
                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--action)" }} />
                            <span className="text-[11px] text-muted-foreground">
                              {isGenerating ? "Gerando com IA..." : "Aplicando logo..."}
                            </span>
                          </div>
                        )}
                        {generated && !branded && !isGenerating && !isBranding && (
                          <div
                            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: "color-mix(in oklch, var(--action) 90%, transparent)", color: "var(--action-foreground)" }}
                          >
                            LIMPA COM IA
                          </div>
                        )}
                        {branded && !isGenerating && !isBranding && (
                          <div
                            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: "color-mix(in oklch, var(--warning) 90%, transparent)", color: "color-mix(in oklch, var(--warning) 14%, var(--background))" }}
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
                              className="w-full h-1 accent-[var(--action)]"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground/70">Opacidade {imgConfig.opacity}%</span>
                            <input
                              type="range" min={20} max={100}
                              value={imgConfig.opacity}
                              onChange={(e) => updateImageLogoConfig(img, { opacity: Number(e.target.value) })}
                              className="w-full h-1 accent-[var(--action)]"
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
                                ? "color-mix(in oklch, var(--action) 30%, transparent)"
                                : "var(--action)",
                              color: "var(--action-foreground)",
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
                              background: "color-mix(in oklch, var(--warning) 90%, transparent)",
                              color: "color-mix(in oklch, var(--warning) 14%, var(--background))",
                            }}
                          >
                            COM LOGO
                          </div>
                        ) : generatedImages[product.images[selectedMainImage]] ? (
                          <div
                            className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              background: "color-mix(in oklch, var(--action) 90%, transparent)",
                              color: "var(--action-foreground)",
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
                                    ? "border-[var(--action)] ring-1 ring-[var(--action)]"
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
                                    style={{ background: brandedImages[img] ? "var(--warning)" : "var(--action)" }}
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
                      style={{ color: "var(--action)" }}
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
  );
}
