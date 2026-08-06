"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileText, Loader2, PackageSearch, Palette, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { StorePolicy } from "@/types";
import Link from "next/link";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  target_language?: string | null;
}

interface OptimizedProductResult {
  title: string;
  description: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
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
  const t = useTranslations("optimizer");
  const [currentTheme, setCurrentTheme] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");

  const [policies, setPolicies] = useState<StorePolicy[]>([]);
  const [themeSuggestions, setThemeSuggestions] = useState("");
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [publishingPolicies, setPublishingPolicies] = useState(false);
  const [loadingTheme, setLoadingTheme] = useState(false);
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productSpecs, setProductSpecs] = useState("");
  const [optimizingProduct, setOptimizingProduct] = useState(false);
  const [optimizedProduct, setOptimizedProduct] =
    useState<OptimizedProductResult | null>(null);

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data } = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche, target_language")
        .order("created_at", { ascending: false });
      if (data) {
        setStores(data);
        if (data.length === 1) {
          setSelectedStore(data[0].id);
        }
        return;
      }

      const fallback = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche")
        .order("created_at", { ascending: false });
      if (fallback.data) {
        setStores(fallback.data.map((store) => ({ ...store, target_language: "pt-BR" })));
        if (fallback.data.length === 1) {
          setSelectedStore(fallback.data[0].id);
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

  async function handleOptimizeProduct() {
    if (!selectedStore) {
      toast.error("Selecione uma loja");
      return;
    }
    if (!productTitle.trim()) {
      toast.error("Informe o titulo do produto");
      return;
    }

    setOptimizingProduct(true);
    setOptimizedProduct(null);

    try {
      const specs = Object.fromEntries(
        productSpecs
          .split("\n")
          .map((line) => line.split(":"))
          .filter(([key, value]) => key?.trim() && value?.trim())
          .map(([key, ...value]) => [key.trim(), value.join(":").trim()])
      );

      const res = await fetch("/api/ai/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          product: {
            title: productTitle,
            description: productDescription,
            price: Number(productPrice.replace(",", ".")) || 0,
            originalPrice: Number(productPrice.replace(",", ".")) || 0,
            images: [],
            specs,
            rating: 0,
            orders: 0,
            variantOptions: [],
            variants: [],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao otimizar produto");

      setOptimizedProduct(data.result);
      toast.success("Produto otimizado no idioma da loja.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao otimizar produto");
    } finally {
      setOptimizingProduct(false);
    }
  }

  const selectedStoreData = stores.find((s) => s.id === selectedStore);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      {/* Sem loja conectada a pagina inteira ficava vazia (o seletor era
          escondido e o banner virava null), passando a impressao de bug. */}
      {stores.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">
            Conecte uma loja para usar o otimizador
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            O conteudo e gerado a partir do perfil da loja (nicho, publico e voz
            da marca), entao e preciso ter ao menos uma loja conectada.
          </p>
          <Link
            href="/stores"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Conectar loja
          </Link>
        </div>
      )}

      {stores.length > 0 && (
        <div className="w-72 space-y-2">
          <Label className="text-[13px] text-muted-foreground">
            {t("target_store")}
          </Label>
          <Select
            value={selectedStore}
            onValueChange={(v) => setSelectedStore(v ?? "")}
          >
            <SelectTrigger className="h-10 bg-card border-border/50 text-sm">
              <SelectValue placeholder="Selecione a loja">
                {(value: string) => {
                  const selected = stores.find((s) => s.id === value);
                  return selected ? `${selected.name} (${selected.shop_domain})` : value;
                }}
              </SelectValue>
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

      {selectedStoreData ? (
        <Card className="border-primary/25 bg-primary/8">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("store_in_use", { name: selectedStoreData.name })}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("store_language_note")}{" "}
                <span className="font-semibold text-foreground">
                  {selectedStoreData.target_language || "pt-BR"}
                </span>
                . {t("store_language_change")}
              </p>
            </div>
            <Link href="/stores">
              <Button variant="outline" size="sm">
                {t("edit_profile")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle
            className="text-[13px] font-medium uppercase text-muted-foreground"
            style={{ letterSpacing: "0.05em" }}
          >
            {t("config_title")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("config_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground">
              {t("store_profile")}
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
                        {t("profile_incomplete")}{" "}
                        <Link href="/stores" className="underline hover:text-foreground transition-colors">
                          {t("configure")}
                        </Link>
                      </p>
                    </div>
                );
              })()
            ) : (
              <div className="h-10 flex items-center px-3 rounded-md border border-border/50 bg-background/50">
                <p className="text-sm text-muted-foreground/50">{t("select_store_above")}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground">
              {t("current_theme")}
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

      <Tabs defaultValue="product">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="product" className="text-[13px]">
            <PackageSearch className="mr-2 h-3.5 w-3.5" />
            {t("tab_product")}
          </TabsTrigger>
          <TabsTrigger value="policies" className="text-[13px]">
            <FileText className="mr-2 h-3.5 w-3.5" />
            {t("tab_policies")}
          </TabsTrigger>
          <TabsTrigger value="theme" className="text-[13px]">
            <Palette className="mr-2 h-3.5 w-3.5" />
            {t("tab_theme")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="product" className="space-y-4 animate-fade-in">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_1fr]">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("optimize_product_title")}
                </CardTitle>
                <CardDescription>
                  {t("optimize_product_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("original_title")}</Label>
                  <Input
                    value={productTitle}
                    onChange={(event) => setProductTitle(event.target.value)}
                    placeholder={t("original_title_placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("description_label")}</Label>
                  <Textarea
                    value={productDescription}
                    onChange={(event) => setProductDescription(event.target.value)}
                    rows={6}
                    placeholder={t("description_placeholder")}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("base_price")}</Label>
                    <Input
                      value={productPrice}
                      onChange={(event) => setProductPrice(event.target.value)}
                      inputMode="decimal"
                      placeholder="Ex: 49.90"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("specs")}</Label>
                    <Textarea
                      value={productSpecs}
                      onChange={(event) => setProductSpecs(event.target.value)}
                      rows={3}
                      placeholder={t("specs_placeholder")}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleOptimizeProduct}
                  disabled={optimizingProduct || !selectedStore || !productTitle.trim()}
                >
                  {optimizingProduct ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {t("optimize_btn")}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">{t("result_title")}</CardTitle>
                <CardDescription>
                  {t("result_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {optimizedProduct ? (
                  <div className="space-y-4">
                    <div>
                      <Label>{t("result_title_label")}</Label>
                      <div className="mt-2 rounded-lg border border-border/60 bg-background/55 p-3 text-sm font-semibold">
                        {optimizedProduct.title}
                      </div>
                    </div>
                    <div>
                      <Label>{t("result_description_label")}</Label>
                      <div
                        className="mt-2 max-h-64 overflow-auto rounded-lg border border-border/60 bg-background/55 p-3 text-sm leading-6"
                        dangerouslySetInnerHTML={{ __html: optimizedProduct.description }}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>{t("result_tags_label")}</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {optimizedProduct.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-border/60 bg-background/55 px-2 py-1 text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <Label>SEO title</Label>
                          <p className="mt-1 rounded-md border border-border/60 bg-background/55 p-2 text-xs">
                            {optimizedProduct.seoTitle}
                          </p>
                        </div>
                        <div>
                          <Label>SEO description</Label>
                          <p className="mt-1 rounded-md border border-border/60 bg-background/55 p-2 text-xs leading-5">
                            {optimizedProduct.seoDescription}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
                    {t("result_placeholder")}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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
                  {t("generating")}
                </span>
              ) : (
                <>
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  {t("generate_policies_btn")}
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
                    {t("publishing")}
                  </span>
                ) : (
                  <>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {!selectedStore
                      ? t("select_store_first")
                      : t("publish_shopify_btn")}
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
                {t("analyzing")}
              </span>
            ) : (
              <>
                <Palette className="mr-2 h-3.5 w-3.5" />
                {t("analyze_theme_btn")}
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
