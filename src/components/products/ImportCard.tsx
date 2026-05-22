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
  customPrompt,
  setCustomPrompt,
  hasSelectedStore,
}: ImportCardProps) {
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
              onChange={(e) => setNeutralizeOnImport(e.target.checked)}
              disabled={loading || !hasSelectedStore}
              className="mt-0.5 h-4 w-4 rounded border-border/70 bg-background accent-primary"
            />
            <span>
              <span className="block font-medium text-foreground">
                Neutralizar produto (stock)
              </span>
              <span className="text-xs text-muted-foreground">
                Remove marcas d&apos;agua, logos externos e indicativos de marketplace.
              </span>
            </span>
          </label>
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
