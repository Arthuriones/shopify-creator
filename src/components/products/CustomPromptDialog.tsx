"use client";

import { useState } from "react";
import { DollarSign, ImageIcon, SlidersHorizontal, Type, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CustomPromptDialogProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

function buildPrompt(input: {
  imageInstructions: string;
  descriptionInstructions: string;
  pricingInstructions: string;
  generalInstructions: string;
}) {
  const sections = [
    ["IMAGENS", input.imageInstructions],
    ["DESCRICOES E COPY", input.descriptionInstructions],
    ["PRECOS E OFERTA", input.pricingInstructions],
    ["INSTRUCOES GERAIS", input.generalInstructions],
  ]
    .map(([title, body]) => [title, body.trim()] as const)
    .filter(([, body]) => body.length > 0);

  return sections.map(([title, body]) => `${title}:\n${body}`).join("\n\n");
}

export function CustomPromptDialog({
  value,
  onChange,
  disabled,
  className,
}: CustomPromptDialogProps) {
  const [open, setOpen] = useState(false);
  const [imageInstructions, setImageInstructions] = useState("");
  const [descriptionInstructions, setDescriptionInstructions] = useState("");
  const [pricingInstructions, setPricingInstructions] = useState("");
  const [generalInstructions, setGeneralInstructions] = useState("");
  const hasPrompt = value.trim().length > 0;

  function handleOpen() {
    const hasDraft =
      imageInstructions ||
      descriptionInstructions ||
      pricingInstructions ||
      generalInstructions;

    if (hasDraft) {
      setOpen(true);
      return;
    }

    if (value.trim()) {
      setGeneralInstructions(value.trim());
    }
    setOpen(true);
  }

  function handleSave() {
    onChange(
      buildPrompt({
        imageInstructions,
        descriptionInstructions,
        pricingInstructions,
        generalInstructions,
      })
    );
    setOpen(false);
  }

  function handleClear() {
    setImageInstructions("");
    setDescriptionInstructions("");
    setPricingInstructions("");
    setGeneralInstructions("");
    onChange("");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          "h-10 justify-between border-border/60 bg-background/50 text-sm",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <WandSparkles className="h-4 w-4 text-primary" />
          Prompt personalizado
        </span>
        <span className="text-xs text-muted-foreground">
          {hasPrompt ? "Configurado" : "Adicionar"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-lg border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Prompt personalizado</DialogTitle>
            <DialogDescription>
              Direcione a IA para ajustar imagens, texto, oferta e detalhes comerciais.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
              <Label className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-4 w-4 text-primary" />
                Imagens e edicao visual
              </Label>
              <Textarea
                rows={4}
                value={imageInstructions}
                onChange={(event) => setImageInstructions(event.target.value)}
                placeholder="Ex.: remover selos do vendedor, manter embalagem original, fundo branco, sem textos extras."
                className="bg-background/70 text-sm"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
              <Label className="flex items-center gap-2 text-sm">
                <Type className="h-4 w-4 text-primary" />
                Descricoes, titulos e SEO
              </Label>
              <Textarea
                rows={4}
                value={descriptionInstructions}
                onChange={(event) => setDescriptionInstructions(event.target.value)}
                placeholder="Ex.: tom premium, bullets curtos, foco em colecionadores, nao prometer originalidade."
                className="bg-background/70 text-sm"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
              <Label className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-primary" />
                Precos e oferta
              </Label>
              <Textarea
                rows={4}
                value={pricingInstructions}
                onChange={(event) => setPricingInstructions(event.target.value)}
                placeholder="Ex.: sugerir preco com margem alta, manter compare-at price, criar oferta em 12x."
                className="bg-background/70 text-sm"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
              <Label className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Regras gerais
              </Label>
              <Textarea
                rows={4}
                value={generalInstructions}
                onChange={(event) => setGeneralInstructions(event.target.value)}
                placeholder="Ex.: manter variacoes, nao inventar garantia, evitar termos de marketplace."
                className="bg-background/70 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClear}>
              Limpar
            </Button>
            <Button type="button" onClick={handleSave}>
              Salvar instrucoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
