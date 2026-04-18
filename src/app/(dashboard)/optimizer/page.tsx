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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Palette, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { StorePolicy } from "@/types";
import Link from "next/link";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
}

function PolicySkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="skeleton h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

export default function OptimizerPage() {
  const [currentTheme, setCurrentTheme] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");

  const [policies, setPolicies] = useState<StorePolicy[]>([]);
  const [themeSuggestions, setThemeSuggestions] = useState("");
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [publishingPolicies, setPublishingPolicies] = useState(false);
  const [loadingTheme, setLoadingTheme] = useState(false);

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data } = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche")
        .order("created_at", { ascending: false });
      if (data) {
        setStores(data);
        if (data.length === 1) {
          setSelectedStore(data[0].id);
        }
      }
    }
    loadStores();
  }, []);

  async function handleGeneratePolicies() {
    if (!selectedStore) {
      toast.error("Selecione uma loja");
      return;
    }
    const store = stores.find((s) => s.id === selectedStore);
    if (!store?.niche) {
      toast.error("Configure o perfil da loja antes de gerar políticas");
      return;
    }

    setLoadingPolicies(true);

    try {
      const res = await fetch("/api/ai/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      setPolicies(data.policies);
      toast.success("Politicas geradas!");
    } catch {
      toast.error("Erro ao gerar politicas");
    } finally {
      setLoadingPolicies(false);
    }
  }

  async function handlePublishPolicies() {
    if (!selectedStore || policies.length === 0) {
      toast.error("Selecione uma loja e gere as politicas primeiro");
      return;
    }

    setPublishingPolicies(true);

    try {
      const res = await fetch("/api/shopify/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          policies: policies.map((p) => ({
            type: p.type,
            body: p.body,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao publicar politicas");
        return;
      }

      toast.success("Politicas publicadas na Shopify!");
    } catch {
      toast.error("Erro ao publicar politicas");
    } finally {
      setPublishingPolicies(false);
    }
  }

  async function handleAnalyzeTheme() {
    if (!selectedStore || !currentTheme) {
      toast.error("Selecione uma loja e informe o tema");
      return;
    }
    const store = stores.find((s) => s.id === selectedStore);
    if (!store?.niche) {
      toast.error("Configure o perfil da loja antes de analisar o tema");
      return;
    }

    setLoadingTheme(true);

    try {
      const res = await fetch("/api/ai/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, currentTheme }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      setThemeSuggestions(data.suggestions);
      toast.success("Analise concluida!");
    } catch {
      toast.error("Erro na analise");
    } finally {
      setLoadingTheme(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2
          className="text-3xl font-semibold text-foreground"
          style={{ letterSpacing: "-0.03em" }}
        >
          Otimizador de Loja
        </h2>
        <p
          className="mt-1 text-base text-muted-foreground"
          style={{ letterSpacing: "-0.01em" }}
        >
          Gere politicas e otimize o tema da sua loja com IA
        </p>
      </div>

      {stores.length > 0 && (
        <div className="w-72 space-y-2">
          <Label className="text-[13px] text-muted-foreground">
            Loja destino
          </Label>
          <Select
            value={selectedStore}
            onValueChange={(v) => setSelectedStore(v ?? "")}
          >
            <SelectTrigger className="h-10 bg-card border-border/50 text-sm">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.shop_domain})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle
            className="text-[13px] font-medium uppercase text-muted-foreground"
            style={{ letterSpacing: "0.05em" }}
          >
            Configuracao
          </CardTitle>
          <CardDescription className="text-xs">
            Informe os dados da loja para gerar conteudo otimizado
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground">
              Perfil da loja
            </Label>
            {selectedStore ? (
              (() => {
                const store = stores.find((s) => s.id === selectedStore);
                return store?.niche ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-background/50">
                    <span className="text-sm text-foreground/80">{store.name}</span>
                    <span className="text-[11px] text-muted-foreground/50">•</span>
                    <span className="text-[12px] text-muted-foreground">{store.niche}</span>
                  </div>
                ) : (
                    <div className="flex items-center h-10 px-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-sm text-muted-foreground">
                        Perfil incompleto.{" "}
                        <Link href="/stores" className="underline hover:text-foreground transition-colors">
                          Configurar
                        </Link>
                      </p>
                    </div>
                );
              })()
            ) : (
              <div className="h-10 flex items-center px-3 rounded-md border border-border/50 bg-background/50">
                <p className="text-sm text-muted-foreground/50">Selecione uma loja acima</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground">
              Tema Atual (para analise)
            </Label>
            <Input
              placeholder="Dawn, Sense, Vessel..."
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value)}
              className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="policies">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="policies" className="text-[13px]">
            <FileText className="mr-2 h-3.5 w-3.5" />
            Politicas
          </TabsTrigger>
          <TabsTrigger value="theme" className="text-[13px]">
            <Palette className="mr-2 h-3.5 w-3.5" />
            Tema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4 animate-fade-in">
          <div className="flex gap-3">
            <Button
              onClick={handleGeneratePolicies}
              disabled={loadingPolicies}
              className="h-9 text-[13px] font-medium transition-all duration-200"
              style={{
                background: loadingPolicies
                  ? "oklch(0.72 0.19 155 / 70%)"
                  : "oklch(0.72 0.19 155)",
                color: "oklch(0.13 0.02 155)",
              }}
            >
              {loadingPolicies ? (
                <span className="flex items-center gap-2">
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  Gerando
                </span>
              ) : (
                <>
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  Gerar Politicas
                </>
              )}
            </Button>

            {policies.length > 0 && (
              <Button
                onClick={handlePublishPolicies}
                disabled={publishingPolicies || !selectedStore}
                variant="outline"
                className="h-9 text-[13px] font-medium border-border/50 transition-all duration-200"
              >
                {publishingPolicies ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    Publicando
                  </span>
                ) : (
                  <>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {!selectedStore
                      ? "Selecione uma loja"
                      : "Publicar na Shopify"}
                  </>
                )}
              </Button>
            )}
          </div>

          {loadingPolicies && (
            <div className="grid gap-4 md:grid-cols-2">
              <PolicySkeleton />
              <PolicySkeleton />
              <PolicySkeleton />
              <PolicySkeleton />
            </div>
          )}

          {policies.length > 0 && !loadingPolicies && (
            <div className="grid gap-4 md:grid-cols-2 stagger-children">
              {policies.map((policy) => (
                <Card key={policy.type} className="border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:border-border">
                  <CardHeader>
                    <CardTitle
                      className="text-[15px] font-semibold"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {policy.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm prose-invert max-h-60 overflow-auto text-sm text-muted-foreground/80 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: policy.body }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="theme" className="space-y-4 animate-fade-in">
          <Button
            onClick={handleAnalyzeTheme}
            disabled={loadingTheme}
            className="h-9 text-[13px] font-medium transition-all duration-200"
            style={{
              background: loadingTheme
                ? "oklch(0.72 0.19 155 / 70%)"
                : "oklch(0.72 0.19 155)",
              color: "oklch(0.13 0.02 155)",
            }}
          >
            {loadingTheme ? (
              <span className="flex items-center gap-2">
                <span className="inline-flex gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Analisando
              </span>
            ) : (
              <>
                <Palette className="mr-2 h-3.5 w-3.5" />
                Analisar Tema
              </>
            )}
          </Button>

          {loadingTheme && (
            <Card className="border-border/50">
              <CardContent className="pt-6 space-y-3">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-5 w-40 mt-4" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-4/5" />
              </CardContent>
            </Card>
          )}

          {themeSuggestions && !loadingTheme && (
            <Card className="border-border/50 animate-fade-in">
              <CardContent className="pt-6">
                <div className="prose prose-sm prose-invert max-w-none text-muted-foreground/80 leading-relaxed">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: themeSuggestions.replace(/\n/g, "<br />"),
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
