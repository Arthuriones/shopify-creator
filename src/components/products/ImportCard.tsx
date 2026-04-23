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

interface ImportCardProps {
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  handleScrape: (e: React.FormEvent) => Promise<void>;
}

export function ImportCard({ url, setUrl, loading, handleScrape }: ImportCardProps) {
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
      </CardContent>
    </Card>
  );
}
