import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Stamp } from "lucide-react";

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

const LOGO_POSITION_OPTIONS: { value: LogoPosition; label: string }[] = [
  { value: "top-left", label: "Topo esquerdo" },
  { value: "top-center", label: "Topo centro" },
  { value: "top-right", label: "Topo direito" },
  { value: "center-left", label: "Centro esquerdo" },
  { value: "center", label: "Centro" },
  { value: "center-right", label: "Centro direito" },
  { value: "bottom-left", label: "Inferior esquerdo" },
  { value: "bottom-center", label: "Inferior centro" },
  { value: "bottom-right", label: "Inferior direito" },
];

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

interface LogoCustomizationCardProps {
  logoPosition: LogoPosition;
  setLogoPosition: (pos: LogoPosition) => void;
  logoScalePercent: number;
  setLogoScalePercent: (val: number) => void;
  logoMarginPercent: number;
  setLogoMarginPercent: (val: number) => void;
  logoOpacityPercent: number;
  setLogoOpacityPercent: (val: number) => void;
  brandingAll: boolean;
  brandingProgress: { done: number; total: number } | null;
  handleBrandAllImages: () => Promise<void>;
  selectedStore: string;
  stores: StoreOption[];
}

export function LogoCustomizationCard({
  logoPosition,
  setLogoPosition,
  logoScalePercent,
  setLogoScalePercent,
  logoMarginPercent,
  setLogoMarginPercent,
  logoOpacityPercent,
  setLogoOpacityPercent,
  brandingAll,
  brandingProgress,
  handleBrandAllImages,
  selectedStore,
  stores,
}: LogoCustomizationCardProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle
          className="text-[13px] font-medium uppercase text-muted-foreground"
          style={{ letterSpacing: "0.05em" }}
        >
          Customizacao de Midia (Logo)
        </CardTitle>
        <CardDescription className="text-xs">
          Ajuste posicao, tamanho e opacidade da logo. Ao aplicar, o preview atualiza automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Posicao</Label>
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
              Tamanho ({logoScalePercent}%)
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
              Margem ({logoMarginPercent}%)
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
              Opacidade ({logoOpacityPercent}%)
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleBrandAllImages()}
            disabled={
              brandingAll ||
              !selectedStore ||
              !stores.find((store) => store.id === selectedStore)?.logo_path
            }
            className="h-9 text-[13px]"
            style={{
              background: "oklch(0.72 0.19 155)",
              color: "oklch(0.13 0.02 155)",
            }}
          >
            {brandingAll ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aplicando logo ({brandingProgress?.done ?? 0}/{brandingProgress?.total ?? 0})...
              </span>
            ) : (
              <>
                <Stamp className="mr-1.5 h-3.5 w-3.5" />
                Aplicar logo em todas as midias
              </>
            )}
          </Button>
          {!stores.find((store) => store.id === selectedStore)?.logo_path && (
            <span className="text-xs text-muted-foreground">
              Configure a logo da loja na pagina Lojas para usar essa funcao.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
