"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckSquare,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  target_language?: string | null;
}

interface GeneratedReview {
  productId?: string;
  productTitle?: string;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  productUseCase: string;
  disclosure: string;
  imagePrompt?: string;
  imageUrl?: string;
}

interface ProductOption {
  id: string;
  title: string;
  handle: string;
  status?: string;
  descriptionHtml?: string | null;
  tags?: string[];
  seo?: { title?: string | null; description?: string | null } | null;
  images?: { nodes?: { url?: string | null; altText?: string | null }[] };
  variants?: { nodes?: { price?: string | null; sku?: string | null }[] };
}

const toneOptions = [
  { value: "natural", label: "Natural" },
  { value: "premium", label: "Premium" },
  { value: "short_social", label: "Curto para social" },
  { value: "detailed", label: "Detalhado" },
];

const imageStyleOptions = [
  { value: "unboxing", label: "Unboxing" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "hands_detail", label: "Mãos segurando" },
  { value: "home_tabletop", label: "Mesa/casa" },
  { value: "mirrorless_crop", label: "Crop sem rosto" },
];

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function reviewsToCsv(reviews: GeneratedReview[]) {
  const header = [
    "Product",
    "Product ID",
    "Name",
    "Rating",
    "Title",
    "Review",
    "Use case",
    "Image URL",
    "Disclosure",
  ];
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = reviews.map((review) => [
    review.productTitle || "",
    review.productId || "",
    review.customerName,
    review.rating,
    review.title,
    review.body,
    review.productUseCase,
    review.imageUrl || "",
    review.disclosure,
  ]);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function looksLikeGeneratedId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatDomainLabel(value?: string | null) {
  if (!value) return "";
  const clean = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^admin\.shopify\.com\/store\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .replace(/\.myshopify\.com$/i, "");

  const base = clean.includes(".") ? clean.split(".")[0] : clean;
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStoreLabel(store?: StoreOption) {
  if (!store) return "Selecione uma loja";
  const name = store.name?.trim();
  if (name && name !== store.id && !looksLikeGeneratedId(name) && !name.includes(".")) {
    return name;
  }
  return formatDomainLabel(store.shop_domain || name) || `Loja ${store.id.slice(0, 8)}`;
}

function stripHtml(value?: string | null) {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ReviewsPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [count, setCount] = useState("4");
  const [tone, setTone] = useState("natural");
  const [imageStyle, setImageStyle] = useState("unboxing");
  const [includeImages, setIncludeImages] = useState(true);
  const [publishToWidget, setPublishToWidget] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [reviews, setReviews] = useState<GeneratedReview[]>([]);
  const [disclosure, setDisclosure] = useState("");

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === storeId),
    [storeId, stores]
  );

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const haystack = [
        product.title,
        product.handle,
        ...(product.tags || []),
        ...(product.variants?.nodes || []).map((variant) => variant.sku || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [productSearch, products]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds]
  );

  const primarySelectedProduct = selectedProducts[0];
  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const widgetScript = `<script
  src="${appBaseUrl.replace(/\/$/, "")}/reviews-widget-loader.js"
  async>
</script>`;

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche, target_language")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setStores(data);
        if (data[0]) setStoreId(data[0].id);
        return;
      }

      const fallback = await supabase
        .from("stores")
        .select("id, name, shop_domain, niche")
        .order("created_at", { ascending: false });

      if (fallback.data) {
        const normalized = fallback.data.map((store) => ({
          ...store,
          target_language: "pt-BR",
        }));
        setStores(normalized);
        if (normalized[0]) setStoreId(normalized[0].id);
      }
    }

    void loadStores();
  }, []);

  const loadProducts = useCallback(async (selectedStoreId = storeId) => {
    if (!selectedStoreId) return;

    setProductsLoading(true);
    setProductsError("");
    try {
      const res = await fetch(
        `/api/shopify/products?storeId=${encodeURIComponent(selectedStoreId)}&first=250`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar produtos.");
      setProducts(data.products || []);
      setSelectedProductIds([]);
    } catch (error) {
      setProducts([]);
      setProductsError(
        error instanceof Error ? error.message : "Falha ao carregar produtos."
      );
    } finally {
      setProductsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void loadProducts(storeId);
  }, [loadProducts, storeId]);

  async function handleGenerate() {
    if (!storeId) {
      toast.error("Selecione uma loja.");
      return;
    }

    const manualProduct: ProductOption[] = productTitle.trim()
      ? [
          {
            id: "manual",
            title: productTitle.trim(),
            descriptionHtml: productDescription,
            handle: "manual",
          },
        ]
      : [];
    const targets: ProductOption[] =
      selectedProducts.length > 0 ? selectedProducts : manualProduct;

    if (targets.length === 0) {
      toast.error("Selecione produtos da loja ou informe um produto manual.");
      return;
    }

    setLoading(true);
    setReviews([]);
    setDisclosure("");
    setGenerationProgress("");

    try {
      const allReviews: GeneratedReview[] = [];
      let lastDisclosure = "";

      for (const [index, product] of targets.entries()) {
        setGenerationProgress(
          `Gerando ${index + 1}/${targets.length}: ${product.title}`
        );
        const description = [
          stripHtml(product.descriptionHtml),
          product.seo?.description || "",
          product.tags?.length ? `Tags: ${product.tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const res = await fetch("/api/ai/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            productId: product.id,
            productHandle: product.handle,
            productTitle: product.title,
            productDescription:
              product.id === "manual" ? productDescription : description,
            count: Number(count),
            tone,
            imageStyle,
            includeImages,
            publishToWidget: publishToWidget && product.id !== "manual",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao gerar reviews.");

        lastDisclosure = data.disclosure || lastDisclosure;
        const generated = (data.reviews || []).map((review: GeneratedReview) => ({
          ...review,
          productId: product.id,
          productTitle: product.title,
        }));
        allReviews.push(...generated);
        setReviews([...allReviews]);
      }

      setDisclosure(lastDisclosure);
      toast.success(
        `${allReviews.length} reviews sintéticos gerados para ${targets.length} produto(s).`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar reviews.");
    } finally {
      setLoading(false);
      setGenerationProgress("");
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  function selectVisibleProducts() {
    setSelectedProductIds((current) => {
      const merged = new Set(current);
      filteredProducts.forEach((product) => merged.add(product.id));
      return Array.from(merged);
    });
  }

  function copyJson() {
    const content = JSON.stringify({ disclosure, reviews }, null, 2);
    navigator.clipboard.writeText(content);
    toast.success("JSON copiado.");
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <header className="grid gap-4 border-b border-border/60 pb-6 xl:grid-cols-[1fr_420px] xl:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-md">
              reviews sinteticos
            </Badge>
            <Badge variant="outline" className="rounded-md">
              fotos IA
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Gerador de Reviews
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Gere textos e imagens UGC sintéticas para mockups, criativos e prévias.
            O conteúdo sai no idioma configurado da loja e vem com disclosure de IA.
          </p>
        </div>
        <Card className="rounded-lg border-amber-300/70 bg-amber-50/80">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-900" />
              <p className="text-xs leading-5 text-amber-950">
                Use como conteúdo sintético ou material de demonstração. Não publique
                como avaliação real de cliente sem indicar que foi gerado por IA.
              </p>
            </div>
          </CardContent>
        </Card>
      </header>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Configurar geração
            </CardTitle>
            <CardDescription>
              Escolha uma loja, marque produtos reais e gere reviews em lote.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={(value) => setStoreId(value || "")}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione uma loja">
                    {formatStoreLabel(selectedStore)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {formatStoreLabel(store)} ({store.target_language || "pt-BR"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStore ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Idioma usado: {selectedStore.target_language || "pt-BR"}.
                </p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/8 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label>Produto vinculado</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    O review será gerado usando dados reais da Shopify e exportado
                    com ID e título do produto.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadProducts()}
                  disabled={!storeId || productsLoading}
                  className="shrink-0"
                >
                  {productsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Atualizar
                </Button>
              </div>

              <Select
                value={selectedProductIds.length === 1 ? selectedProductIds[0] : ""}
                onValueChange={(value) => {
                  setSelectedProductIds(value ? [value] : []);
                }}
              >
                <SelectTrigger className="w-full min-w-0 bg-background">
                  <SelectValue
                    placeholder={
                      productsLoading
                        ? "Carregando produtos..."
                        : "Selecione um produto real da loja"
                    }
                  >
                    {primarySelectedProduct?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <span className="block max-w-[340px] truncate">
                        {product.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {primarySelectedProduct ? (
                <div className="flex gap-3 rounded-lg border border-border/60 bg-background/65 p-2.5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {primarySelectedProduct.images?.nodes?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={primarySelectedProduct.images.nodes[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {primarySelectedProduct.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {primarySelectedProduct.status || "sem status"} ·{" "}
                      {primarySelectedProduct.variants?.nodes?.length || 0} variante(s)
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {stripHtml(primarySelectedProduct.descriptionHtml) ||
                        primarySelectedProduct.seo?.description ||
                        "Sem descrição cadastrada."}
                    </p>
                  </div>
                </div>
              ) : null}

              {productsError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
                  {productsError}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-border/60 bg-background/45 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Seleção em massa</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use quando quiser gerar reviews para vários produtos ao mesmo tempo.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadProducts()}
                  disabled={!storeId || productsLoading}
                >
                  {productsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Atualizar
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar por título, handle, SKU ou tag"
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-md">
                  {products.length} carregado(s)
                </Badge>
                <Badge variant="outline" className="rounded-md">
                  {selectedProductIds.length} selecionado(s)
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectVisibleProducts}
                  disabled={filteredProducts.length === 0}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Selecionar visíveis
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProductIds([])}
                  disabled={selectedProductIds.length === 0}
                >
                  Limpar
                </Button>
              </div>

              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {productsLoading ? (
                  <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                    Carregando produtos da Shopify...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                    Nenhum produto encontrado nessa loja.
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const selected = selectedProductIds.includes(product.id);
                    const image = product.images?.nodes?.[0]?.url;
                    return (
                      <label
                        key={product.id}
                        className={`flex cursor-pointer gap-3 rounded-lg border p-2.5 transition-colors ${
                          selected
                            ? "border-primary/45 bg-primary/10"
                            : "border-border/60 bg-card/60 hover:bg-muted/35"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {product.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {product.status || "sem status"} · {product.variants?.nodes?.length || 0} variante(s)
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <details className="rounded-lg border border-border/60 bg-background/35 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Produto manual opcional
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Use apenas para mockup solto. Para reviews vinculados, selecione
                  um produto real acima.
                </p>
                <div className="space-y-2">
                  <Label>Nome do produto manual</Label>
                  <Input
                    value={productTitle}
                    onChange={(event) => {
                      setProductTitle(event.target.value);
                      if (event.target.value.trim()) setSelectedProductIds([]);
                    }}
                    placeholder="Ex: Colar halo de luz com moissanite"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição manual ou benefícios</Label>
                  <Textarea
                    value={productDescription}
                    onChange={(event) => setProductDescription(event.target.value)}
                    rows={4}
                    placeholder="Material, uso, diferenciais, público..."
                  />
                </div>
              </div>
            </details>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Select value={count} onValueChange={(value) => setCount(value || "4")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 8].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} reviews
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tom</Label>
                <Select value={tone} onValueChange={(value) => setTone(value || "natural")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {toneOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estilo da foto IA</Label>
              <Select
                value={imageStyle}
                onValueChange={(value) => setImageStyle(value || "unboxing")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageStyleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(event) => setIncludeImages(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium text-foreground">
                  Gerar fotos com IA
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Cria imagens sintéticas estilo UGC, preferindo mãos, mesa,
                  unboxing ou cortes sem rosto identificável.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm">
              <input
                type="checkbox"
                checked={publishToWidget}
                onChange={(event) => setPublishToWidget(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium text-foreground">
                  Salvar para aparecer na página do produto
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Vincula os reviews ao produto selecionado e deixa o widget da
                  vitrine carregar automaticamente. Produto manual não é publicado.
                </span>
              </span>
            </label>

            <Button
              onClick={handleGenerate}
              disabled={
                loading ||
                !storeId ||
                (selectedProductIds.length === 0 && !productTitle.trim())
              }
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : includeImages ? (
                <Camera className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading
                ? "Gerando..."
                : selectedProductIds.length > 0
                  ? `Gerar em massa (${selectedProductIds.length})`
                  : "Gerar review manual"}
            </Button>
            {generationProgress ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {generationProgress}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-lg border-border/60">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-lg">Widget na vitrine</CardTitle>
                <CardDescription>
                  Cole este script no tema da loja uma vez. Depois, os reviews
                  salvos aparecem no produto correspondente.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(widgetScript);
                  toast.success("Script do widget copiado.");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar script
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-auto rounded-lg border border-border/60 bg-background/70 p-4 text-xs leading-6 text-foreground">
                <code>{widgetScript}</code>
              </pre>
              <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 text-xs leading-5 text-amber-950">
                Instale no tema da loja onde os produtos aparecem. Se o tema tiver
                <code className="mx-1 rounded bg-amber-100 px-1">theme.liquid</code>,
                cole antes de <code className="mx-1 rounded bg-amber-100 px-1">&lt;/body&gt;</code>.
                Se não tiver, use a área de código global/head-body do tema ou adicione
                este script no arquivo/section que carrega em todas as páginas de produto.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/60">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg">Reviews gerados</CardTitle>
                <CardDescription>
                  {reviews.length > 0
                    ? `${reviews.length} review(s) para ${new Set(reviews.map((review) => review.productId || review.productTitle)).size} produto(s).`
                    : "Copie, exporte ou use as URLs das imagens em seus mockups."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyJson}
                  disabled={reviews.length === 0}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      "reviews-sinteticos.json",
                      JSON.stringify({ disclosure, reviews }, null, 2),
                      "application/json"
                    )
                  }
                  disabled={reviews.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      "reviews-sinteticos.csv",
                      reviewsToCsv(reviews),
                      "text/csv;charset=utf-8"
                    )
                  }
                  disabled={reviews.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
                  Os reviews aparecem aqui depois da geração.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {reviews.map((review, index) => (
                    <article
                      key={`${review.customerName}-${index}`}
                      className="overflow-hidden rounded-lg border border-border/60 bg-card"
                    >
                      {review.imageUrl ? (
                        <div className="relative aspect-[4/3] bg-background">
                          <Image
                            src={review.imageUrl}
                            alt={review.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-background/60 text-sm text-muted-foreground">
                          Sem imagem
                        </div>
                      )}
                      <div className="space-y-3 p-4">
                        {review.productTitle ? (
                          <Badge variant="secondary" className="rounded-md">
                            {review.productTitle}
                          </Badge>
                        ) : null}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {review.customerName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {review.productUseCase}
                            </p>
                          </div>
                          <div className="flex gap-0.5 text-amber-500">
                            {Array.from({ length: 5 }).map((_, starIndex) => (
                              <Star
                                key={starIndex}
                                className={`h-4 w-4 ${
                                  starIndex < review.rating ? "fill-current" : ""
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-foreground">
                            {review.title}
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {review.body}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {review.disclosure || "Conteudo gerado por IA / simulacao"}
                        </Badge>
                        {review.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(review.imageUrl || "");
                              toast.success("URL da imagem copiada.");
                            }}
                            className="block max-w-full truncate rounded-md bg-background/55 px-2 py-1 text-left font-mono text-[11px] text-muted-foreground"
                          >
                            {review.imageUrl}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {disclosure ? (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Disclosure:</strong> {disclosure}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
