import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface PricingCardProps {
  product: AliExpressProduct;
  setProduct: (product: AliExpressProduct) => void;
  baseImportedProduct: AliExpressProduct | null;
  selectedStoreData: StoreOption | undefined;
  activeCurrency: string;
  priceDraft: string;
  setPriceDraft: (val: string) => void;
  comparePriceDraft: string;
  setComparePriceDraft: (val: string) => void;
  bulkMarkupDraft: string;
  setBulkMarkupDraft: (val: string) => void;
  handleApplyPriceDraft: () => void;
  handleApplyBulkMarkup: () => void;
  applyStorePricingRules: (source: AliExpressProduct, store: StoreOption | undefined) => AliExpressProduct;
  setVariantPriceInputs: (inputs: Record<string, string>) => void;
}

export function PricingCard({
  product,
  setProduct,
  baseImportedProduct,
  selectedStoreData,
  activeCurrency,
  priceDraft,
  setPriceDraft,
  comparePriceDraft,
  setComparePriceDraft,
  bulkMarkupDraft,
  setBulkMarkupDraft,
  handleApplyPriceDraft,
  handleApplyBulkMarkup,
  applyStorePricingRules,
  setVariantPriceInputs,
}: PricingCardProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle
          className="text-[13px] font-medium uppercase text-muted-foreground"
          style={{ letterSpacing: "0.05em" }}
        >
          Preco e moeda do produto
        </CardTitle>
        <CardDescription className="text-xs">
          Ajuste valores manualmente e veja o preview atualizar em tempo real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border/40 text-[11px]">
            Moeda ativa: {activeCurrency}
          </Badge>
          {selectedStoreData?.auto_convert_prices ? (
            <Badge
              className="text-[11px]"
              style={{
                background: "color-mix(in oklch, var(--action) 12%, transparent)",
                color: "var(--action)",
                border: "none",
              }}
            >
              Conversao automatica ligada
            </Badge>
          ) : (
            <Badge variant="outline" className="border-border/40 text-[11px]">
              Conversao automatica desligada
            </Badge>
          )}
          {selectedStoreData && (
            <span className="text-xs text-muted-foreground/80">
              Regra da loja: taxa {selectedStoreData.currency_rate || 1} x markup{" "}
              {selectedStoreData.price_markup_percent || 0}%
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Preco principal</Label>
            <Input
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              inputMode="decimal"
              className="h-10 bg-background/50 border-border/50 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Preco de compare</Label>
            <Input
              value={comparePriceDraft}
              onChange={(e) => setComparePriceDraft(e.target.value)}
              inputMode="decimal"
              className="h-10 bg-background/50 border-border/50 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              className="h-10 w-full text-sm"
              onClick={handleApplyPriceDraft}
            >
              Aplicar precos
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">
              Ajuste em lote das variantes (%)
            </Label>
            <Input
              value={bulkMarkupDraft}
              onChange={(e) => setBulkMarkupDraft(e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 12 para subir 12%, -8 para reduzir 8%"
              className="h-10 bg-background/50 border-border/50 text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 border-border/50"
              onClick={handleApplyBulkMarkup}
            >
              Aplicar markup
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 border-border/50"
              disabled={!baseImportedProduct}
              onClick={() => {
                if (!baseImportedProduct) return;
                const recalculated = applyStorePricingRules(baseImportedProduct, selectedStoreData);
                setProduct(recalculated);
                const recalculatedPrices: Record<string, string> = {};
                recalculated.variants.forEach((v) => {
                  recalculatedPrices[v.sku] = v.price.toFixed(2).replace(".", ",");
                });
                setVariantPriceInputs(recalculatedPrices);
                // toast.success("Regras da loja reaplicadas aos precos."); // Moved to parent or handled locally
              }}
            >
              Reaplicar regra da loja
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
