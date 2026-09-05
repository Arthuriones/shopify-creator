import React, { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Upload, Check } from "lucide-react";
import type { AliExpressProduct } from "@/types";

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

interface EditorFormCardProps {
  product: AliExpressProduct;
  stores: StoreOption[];
  selectedStore: string;
  activeCurrency: string;
  optimizing: boolean;
  handleOptimize: () => void;
  editTitle: string;
  setEditTitle: (val: string) => void;
  editDescription: string;
  setEditDescription: (val: string) => void;
  editTags: string;
  setEditTags: (val: string) => void;
  editSeoTitle: string;
  setEditSeoTitle: (val: string) => void;
  editSeoDescription: string;
  setEditSeoDescription: (val: string) => void;
  variantPriceInputs: Record<string, string>;
  handleVariantPriceChange: (sku: string, value: string) => void;
  publishing: boolean;
  published: boolean;
  handlePublish: () => void;
  formatPrice: (value: number, currencyCode: string) => string;
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

export function EditorFormCard({
  product,
  stores,
  selectedStore,
  activeCurrency,
  optimizing,
  handleOptimize,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  editTags,
  setEditTags,
  editSeoTitle,
  setEditSeoTitle,
  editSeoDescription,
  setEditSeoDescription,
  variantPriceInputs,
  handleVariantPriceChange,
  publishing,
  published,
  handlePublish,
  formatPrice,
}: EditorFormCardProps) {
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  async function handleGenerateDescription() {
    setIsGeneratingDesc(true);
    try {
      const res = await fetch("/api/product/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle || product.title,
          rawDescription: product.description || "",
          storeId: selectedStore,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Erro ao gerar descrição");
        return;
      }

      const data = await res.json();
      setEditDescription(data.descriptionHtml);
      toast.success("Descrição gerada com IA!");
    } catch {
      toast.error("Erro na comunicação com a IA");
    } finally {
      setIsGeneratingDesc(false);
    }
  }

  const selectedStoreName = stores.find((s) => s.id === selectedStore)?.name;

  return (
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
        <Button
          onClick={handleOptimize}
          disabled={optimizing || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche}
          className="w-full h-11 text-sm font-medium transition-all duration-200 mb-4"
          style={{
            background:
              optimizing || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche
                ? "color-mix(in oklch, var(--action) 30%, transparent)"
                : "var(--action)",
            color: "var(--action-foreground)",
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
            "Configure o perfil da loja para usar IA"
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar titulo e tags com IA
            </>
          )}
        </Button>
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
          <div className="flex items-center justify-between">
            <Label className="text-[13px] text-muted-foreground">
              Descrição (HTML)
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateDescription}
              disabled={isGeneratingDesc || !selectedStore}
              className="h-7 text-[11px] border-border/50"
              style={{
                background: isGeneratingDesc ? "color-mix(in oklch, var(--action) 10%, transparent)" : "transparent",
                color: "var(--action)",
              }}
            >
              {isGeneratingDesc ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3 w-3" />
              )}
              {isGeneratingDesc ? "Gerando..." : "Gerar Descrição"}
            </Button>
          </div>
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
          <CharCounter current={editSeoDescription.length} max={155} />
        </div>

        {product.variants.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <Label className="text-[13px] text-muted-foreground uppercase" style={{ letterSpacing: "0.05em" }}>
              Preco das Variantes ({product.variants.length})
            </Label>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/50">
                    <th className="h-9 px-3 text-left align-middle font-medium text-muted-foreground text-xs">Variante</th>
                    <th className="h-9 px-3 text-left align-middle font-medium text-muted-foreground text-xs">Preco Original</th>
                    <th className="h-9 px-3 text-right align-middle font-medium text-muted-foreground text-xs w-[120px]">Preco de Venda</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.sku} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="p-2 px-3 align-middle">
                        <div className="flex flex-col">
                          <span className="font-medium text-[12px] text-foreground/80">
                            {Object.values(v.properties).join(" / ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">{v.sku}</span>
                        </div>
                      </td>
                      <td className="p-2 px-3 align-middle text-[12px] text-muted-foreground/70">
                        {formatPrice(v.originalPrice, activeCurrency)}
                      </td>
                      <td className="p-2 px-3 align-middle text-right">
                        <div className="relative flex items-center justify-end">
                          <span className="absolute left-3 text-xs text-muted-foreground/50 pointer-events-none">R$</span>
                          <Input
                            value={variantPriceInputs[v.sku] !== undefined ? variantPriceInputs[v.sku] : v.price.toFixed(2).replace(".", ",")}
                            onChange={(e) => handleVariantPriceChange(v.sku, e.target.value)}
                            className="h-8 w-[100px] bg-background/50 border-border/50 text-right pl-7 text-[12px] transition-colors focus:border-primary/50"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Button
          className="w-full h-11 text-sm font-medium transition-all duration-200 mt-4"
          onClick={handlePublish}
          disabled={publishing || !selectedStore || published}
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
  );
}
