import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AliExpressProduct } from "@/types";

interface ImportSummaryCardProps {
  product: AliExpressProduct;
  previewDescription: string;
}

export function ImportSummaryCard({ product, previewDescription }: ImportSummaryCardProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle
          className="text-[13px] font-medium uppercase text-muted-foreground"
          style={{ letterSpacing: "0.05em" }}
        >
          Resumo da importacao
        </CardTitle>
        <CardDescription className="text-xs">
          Tudo o que foi trazido do anuncio para voce validar antes de publicar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border/40 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Fotos</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{product.images.length}</p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Variantes</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{product.variants.length}</p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Opcoes de variacao</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{product.variantOptions.length}</p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Descricao</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {previewDescription ? "Importada" : "Vazia"}
            </p>
          </div>
        </div>

        {product.variantOptions.length > 0 && (
          <div className="space-y-2 rounded-md border border-border/35 bg-background/30 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground" style={{ letterSpacing: "0.04em" }}>
              Opcoes encontradas
            </p>
            <div className="space-y-2">
              {product.variantOptions.map((option) => (
                <div key={option.name} className="space-y-1">
                  <p className="text-sm font-medium text-foreground/90">
                    {option.name} ({option.values.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {option.values.slice(0, 12).map((value) => (
                      <Badge key={`${option.name}-${value.name}`} variant="outline" className="border-border/35 text-[11px]">
                        {value.name}
                      </Badge>
                    ))}
                    {option.values.length > 12 && (
                      <span className="text-xs text-muted-foreground">+{option.values.length - 12} mais</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
