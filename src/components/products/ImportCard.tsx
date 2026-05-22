import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { CustomPromptDialog } from "@/components/products/CustomPromptDialog";

interface ImportCardProps {
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  handleScrape: (e: React.FormEvent) => Promise<void>;
  neutralizeOnImport: boolean;
  setNeutralizeOnImport: (value: boolean) => void;
  removeExternalReferencesOnImport: boolean;
  setRemoveExternalReferencesOnImport: (value: boolean) => void;
  aiMediaLimit: string;
  setAiMediaLimit: (value: string) => void;
  genericizeNeutralizedText: boolean;
  setGenericizeNeutralizedText: (value: boolean) => void;
  customPrompt: string;
  setCustomPrompt: (value: string) => void;
  hasSelectedStore: boolean;
}

export function ImportCard({
  url,
  setUrl,
  loading,
  handleScrape,
  neutralizeOnImport,
  setNeutralizeOnImport,
  removeExternalReferencesOnImport,
  setRemoveExternalReferencesOnImport,
  aiMediaLimit,
  setAiMediaLimit,
  genericizeNeutralizedText,
  setGenericizeNeutralizedText,
  customPrompt,
  setCustomPrompt,
  hasSelectedStore,
}: ImportCardProps) {
  const cleanupEnabled = neutralizeOnImport || removeExternalReferencesOnImport;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Importar Anuncio</CardTitle>
        <CardDescription>
          Cole o link do produto do AliExpress (ex: pt.aliexpress.com/item/...)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <div className="flex-1">
            <form onSubmit={handleScrape} className="flex gap-2">
              <Input
                placeholder="https://pt.aliexpress.com/item/100500..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="bg-background/50 border-border/50 transition-colors duration-200 focus:border-primary/50"
              />
              <Button
                type="submit"
                disabled={!url || loading}
                className="w-32 transition-all duration-200"
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
        <div className="mt-4 space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={neutralizeOnImport}
              onChange={(e) => {
                setNeutralizeOnImport(e.target.checked);
                if (e.target.checked) setRemoveExternalReferencesOnImport(false);
              }}
              disabled={loading || !hasSelectedStore}
              className="mt-0.5 h-4 w-4 rounded border-border/70 bg-background accent-primary"
            />
            <span>
              <span className="block font-medium text-foreground">
                Neutralizar produto (stock)
              </span>
              <span className="text-xs text-muted-foreground">
                Remove logos e marcas do proprio produto, alem de marcas externas.
              </span>
            </span>
          </label>
          {neutralizeOnImport && (
            <label className="ml-6 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/8 p-2 text-sm">
              <input
                type="checkbox"
                checked={genericizeNeutralizedText}
                onChange={(event) =>
                  setGenericizeNeutralizedText(event.target.checked)
                }
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-border/70 bg-background accent-primary"
              />
              <span>
                <span className="block font-medium text-foreground">
                  Deixar nome e descricao genericos
                </span>
                <span className="text-xs text-muted-foreground">
                  Ex.: Air Jordan shoes vira Tenis esportivo casual.
                </span>
              </span>
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeExternalReferencesOnImport}
              onChange={(e) => {
                setRemoveExternalReferencesOnImport(e.target.checked);
                if (e.target.checked) setNeutralizeOnImport(false);
              }}
              disabled={loading || !hasSelectedStore}
              className="mt-0.5 h-4 w-4 rounded border-border/70 bg-background accent-primary"
            />
            <span>
              <span className="block font-medium text-foreground">
                Retirar referencias externas
              </span>
              <span className="text-xs text-muted-foreground">
                Remove marca d&apos;agua, logo de vendedor e textos que nao fazem parte do produto.
              </span>
            </span>
          </label>
          <div className="grid gap-2 rounded-md border border-border/40 bg-background/50 p-3 sm:grid-cols-[1fr_150px]">
            <div>
              <p className="text-sm font-medium text-foreground">
                Midias com IA por produto
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Processa so as primeiras midias escolhidas. As demais continuam originais no preview.
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={20}
              value={aiMediaLimit}
              onChange={(event) => setAiMediaLimit(event.target.value)}
              disabled={loading || !cleanupEnabled}
              className="h-10 bg-background/70"
            />
          </div>
          <div className="space-y-2">
            <CustomPromptDialog
              value={customPrompt}
              onChange={setCustomPrompt}
              disabled={loading}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              As instrucoes salvas direcionam a otimizacao e a neutralizacao deste produto.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
