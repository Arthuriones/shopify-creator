"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Upload,
  FileText,
  Menu,
  Globe,
  Check,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { StoreSetup } from "@/types";
import Link from "next/link";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
}

function SectionSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="skeleton h-5 w-40" />
        <div className="skeleton mt-1 h-3 w-64" />
      </CardHeader>
      <CardContent className="space-y-2">
        {[...Array(lines)].map((_, i) => (
          <div
            key={i}
            className="skeleton h-4"
            style={{ width: `${90 - i * 10}%` }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default function StoreSetupPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");

  const [setup, setSetup] = useState<StoreSetup | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

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

  async function handleGenerate() {
    if (!selectedStore) {
      toast.error("Selecione uma loja");
      return;
    }

    const store = stores.find((s) => s.id === selectedStore);
    if (!store?.niche) {
      toast.error("Configure o perfil da loja antes de gerar o setup");
      return;
    }

    setGenerating(true);
    setSetup(null);
    setPublished(false);
    setPublishErrors([]);

    try {
      const res = await fetch("/api/ai/store-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao gerar setup");
        return;
      }

      setSetup(data.setup);
      toast.success("Setup completo gerado!");
    } catch {
      toast.error("Erro ao gerar setup da loja");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!setup || !selectedStore) {
      toast.error("Selecione uma loja e gere o setup primeiro");
      return;
    }

    setPublishing(true);
    setPublishErrors([]);

    try {
      const res = await fetch("/api/shopify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, setup }),
      });

      const data = await res.json();

      if (data.errors?.length > 0) {
        setPublishErrors(data.errors);
        toast.error(`Setup publicado com ${data.errors.length} erro(s)`);
      } else {
        setPublished(true);
        toast.success("Setup completo publicado na Shopify!");
      }
    } catch {
      toast.error("Erro ao publicar setup");
    } finally {
      setPublishing(false);
    }
  }

  const selectedStoreDomain = stores.find(
    (s) => s.id === selectedStore
  )?.shop_domain;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Setup da Loja
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Gere politicas, menus, paginas e rodape com um clique
        </p>
      </header>

      {/* Config */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Loja destino
              </Label>
              {stores.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma loja conectada.{" "}
                  <Link
                    href="/stores"
                    className="underline hover:text-foreground transition-colors duration-200"
                  >
                    Conectar loja
                  </Link>
                </p>
              ) : (
                <Select
                  value={selectedStore}
                  onValueChange={(v) => setSelectedStore(v ?? "")}
                >
                  <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
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
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Perfil da loja
              </Label>
              {selectedStore ? (
                (() => {
                  const store = stores.find((s) => s.id === selectedStore);
                  return store?.niche ? (
                    <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-background/50">
                      <Badge
                        className="text-[11px]"
                        style={{
                          background: "oklch(0.72 0.19 155 / 10%)",
                          color: "oklch(0.72 0.19 155)",
                          border: "none",
                        }}
                      >
                        {store.niche}
                      </Badge>
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
                  <p className="text-sm text-muted-foreground/50">Selecione uma loja</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche}
              className="h-9 text-[13px] font-medium transition-all duration-200"
              style={{
                background:
                  generating || !selectedStore || !stores.find((s) => s.id === selectedStore)?.niche
                    ? "oklch(0.72 0.19 155 / 30%)"
                    : "oklch(0.72 0.19 155)",
                color: "oklch(0.13 0.02 155)",
              }}
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="inline-flex gap-0.5">
                    <span
                      className="h-1 w-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1 w-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1 w-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                  Gerando setup completo
                </span>
              ) : (
                <>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Gerar Setup Completo
                </>
              )}
            </Button>

            {setup && !published && (
              <Button
                onClick={handlePublish}
                disabled={publishing || !selectedStore}
                variant="outline"
                className="h-9 text-[13px] font-medium border-border/50 transition-all duration-200"
              >
                {publishing ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-flex gap-0.5">
                      <span
                        className="h-1 w-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="h-1 w-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="h-1 w-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                    Publicando
                  </span>
                ) : (
                  <>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {!selectedStore
                      ? "Selecione uma loja"
                      : `Publicar na ${selectedStoreDomain}`}
                  </>
                )}
              </Button>
            )}

            {published && (
              <Badge
                className="h-9 px-4 text-[13px] font-medium animate-scale-in"
                style={{
                  background: "oklch(0.72 0.19 155 / 15%)",
                  color: "oklch(0.72 0.19 155)",
                  border: "none",
                }}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Publicado
              </Badge>
            )}
          </div>

          {publishErrors.length > 0 && (
            <div className="mt-3 space-y-1">
              {publishErrors.map((err, i) => (
                <p key={i} className="text-xs text-destructive">
                  {err}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {generating && (
        <div className="grid gap-4 md:grid-cols-2">
          <SectionSkeleton lines={6} />
          <SectionSkeleton lines={5} />
          <SectionSkeleton lines={4} />
          <SectionSkeleton lines={4} />
        </div>
      )}

      {/* Generated setup */}
      {setup && !generating && (
        <Tabs defaultValue="overview" className="animate-fade-in">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="overview" className="text-[13px]">
              <Globe className="mr-2 h-3.5 w-3.5" />
              Visao Geral
            </TabsTrigger>
            <TabsTrigger value="policies" className="text-[13px]">
              <FileText className="mr-2 h-3.5 w-3.5" />
              Politicas
            </TabsTrigger>
            <TabsTrigger value="menus" className="text-[13px]">
              <Menu className="mr-2 h-3.5 w-3.5" />
              Menus
            </TabsTrigger>
            <TabsTrigger value="pages" className="text-[13px]">
              <FileText className="mr-2 h-3.5 w-3.5" />
              Paginas
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="animate-fade-in">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 stagger-children">
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Politicas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-2xl font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {setup.policies.length}
                  </p>
                  <div className="mt-2 space-y-1">
                    {setup.policies.map((p) => (
                      <p
                        key={p.type}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {p.title}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Menu Principal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-2xl font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {setup.mainMenu.items.length}
                  </p>
                  <div className="mt-2 space-y-1">
                    {setup.mainMenu.items.map((item) => (
                      <p
                        key={item.url}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {item.title}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Menu Footer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-2xl font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {setup.footerMenu.items.length}
                  </p>
                  <div className="mt-2 space-y-1">
                    {setup.footerMenu.items.map((item) => (
                      <p
                        key={item.url}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {item.title}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Paginas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-2xl font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {setup.pages.length}
                  </p>
                  <div className="mt-2 space-y-1">
                    {setup.pages.map((page) => (
                      <p
                        key={page.handle}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {page.title}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4 border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-muted-foreground">
                      Copyright
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {setup.copyright}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Policies */}
          <TabsContent value="policies" className="animate-fade-in">
            <div className="grid gap-4 md:grid-cols-2 stagger-children">
              {setup.policies.map((policy) => (
                <Card
                  key={policy.type}
                  className="border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:border-border"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle
                        className="text-[15px] font-semibold"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {policy.title}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className="text-[11px]"
                        style={{
                          background: "oklch(0.72 0.19 155 / 10%)",
                          color: "oklch(0.72 0.19 155)",
                          border: "none",
                        }}
                      >
                        {policy.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm prose-invert max-h-64 overflow-auto text-sm text-muted-foreground/80 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: policy.body }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Menus */}
          <TabsContent value="menus" className="animate-fade-in">
            <div className="grid gap-6 md:grid-cols-2 stagger-children">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Header — {setup.mainMenu.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    handle: {setup.mainMenu.handle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {setup.mainMenu.items.map((item) => (
                      <div
                        key={item.url}
                        className="flex items-center justify-between rounded-md px-3 py-2 bg-background/50 border border-border/30"
                      >
                        <span className="text-sm text-foreground">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.url}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle
                    className="text-[13px] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    Footer — {setup.footerMenu.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    handle: {setup.footerMenu.handle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {setup.footerMenu.items.map((item) => (
                      <div
                        key={item.url}
                        className="flex items-center justify-between rounded-md px-3 py-2 bg-background/50 border border-border/30"
                      >
                        <span className="text-sm text-foreground">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.url}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Pages */}
          <TabsContent value="pages" className="animate-fade-in">
            <div className="grid gap-4 md:grid-cols-2 stagger-children">
              {setup.pages.map((page) => (
                <Card
                  key={page.handle}
                  className="border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:border-border"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle
                        className="text-[15px] font-semibold"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {page.title}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground font-mono">
                        /pages/{page.handle}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm prose-invert max-h-64 overflow-auto text-sm text-muted-foreground/80 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: page.body }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
