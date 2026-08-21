"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
}

interface ProductOption {
  id: string;
  title: string;
  handle: string;
  descriptionHtml?: string | null;
  tags?: string[];
  images?: { nodes?: { url?: string | null; altText?: string | null }[] };
  variants?: { nodes?: { price?: string | null }[] };
}

interface InstagramStatus {
  connected: boolean;
  error?: string;
  connection?: {
    instagram_username?: string | null;
    page_name?: string | null;
    token_expires_at?: string | null;
  } | null;
}

function formatStoreLabel(store?: StoreOption) {
  if (!store) return "Selecione uma loja";
  const cleanDomain = store.shop_domain
    .replace(/^https?:\/\//i, "")
    .replace(/\.myshopify\.com$/i, "")
    .replace(/[-_]+/g, " ");
  return store.name && !store.name.includes(".") ? store.name : cleanDomain;
}

function firstImage(product: ProductOption) {
  return product.images?.nodes?.find((image) => image.url)?.url || "";
}

function productImages(product: ProductOption) {
  const seen = new Set<string>();
  return (
    product.images?.nodes
      ?.map((image) => image.url || "")
      .filter((url) => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      }) || []
  );
}

export default function InstagramPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState("");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [postTone, setPostTone] = useState("natural, premium e vendedor");
  const [caption, setCaption] = useState(
    "Novidades da loja. Confira os produtos selecionados."
  );
  const [slidePlan, setSlidePlan] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState("");

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === storeId),
    [stores, storeId]
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds]
  );

  const selectedImageUrls = useMemo(
    () => {
      if (selectedProducts.length === 1) {
        return productImages(selectedProducts[0]).slice(0, 10);
      }
      return selectedProducts.map(firstImage).filter(Boolean).slice(0, 10);
    },
    [selectedProducts]
  );

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/instagram/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar Instagram.");
      setStatus(data);
    } catch (error) {
      setStatus({
        connected: false,
        error: error instanceof Error ? error.message : "Falha ao carregar Instagram.",
      });
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadProducts(targetStoreId = storeId, options?: { notify?: boolean }) {
    if (!targetStoreId) return;
    setLoadingProducts(true);
    setProductError("");
    try {
      const res = await fetch(
        `/api/shopify/products?storeId=${encodeURIComponent(targetStoreId)}&first=250&status=ACTIVE`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar produtos.");
      setProducts(data.products || []);
      setSelectedProductIds([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar produtos.";
      if (!options?.notify && stores.length > 1) {
        const currentIndex = stores.findIndex((store) => store.id === targetStoreId);
        const nextStore = stores.slice(currentIndex + 1).find((store) => store.id);
        if (nextStore) {
          setStoreId(nextStore.id);
          return;
        }
      }
      setProductError(message);
      if (options?.notify) toast.error(message);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Nao foi possivel carregar lojas.");
        return;
      }

      const loadedStores = data || [];
      setStores(loadedStores);
      const currentStoreId = storeId;
      if (!currentStoreId && loadedStores[0]) setStoreId(loadedStores[0].id);
    }

    void loadStores();
    void loadStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) toast.success("Instagram conectado.");
    if (params.get("error")) toast.error(params.get("error") || "Erro no Instagram.");
  }, []);

  useEffect(() => {
    if (!storeId) return;
    void loadProducts(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : current.length >= 10
          ? current
          : [...current, productId]
    );
  }

  async function publishCarousel() {
    if (!status?.connected) {
      toast.error("Conecte o Instagram primeiro.");
      return;
    }
    if (selectedImageUrls.length < 1) {
      toast.error("Selecione pelo menos 1 produto com imagem.");
      return;
    }

    setPublishing(true);
    setLastResult("");
    try {
      const res = await fetch("/api/instagram/publish-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedProductIds,
          imageUrls: selectedImageUrls,
          caption,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao postar carrossel.");
      setLastResult(data.result?.publishedMediaId || "Publicado");
      toast.success("Carrossel enviado para o Instagram.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao postar carrossel.");
    } finally {
      setPublishing(false);
    }
  }

  async function generatePostWithAi() {
    if (!storeId) {
      toast.error("Selecione uma loja.");
      return;
    }
    if (selectedProducts.length === 0) {
      toast.error("Selecione produtos para a IA preparar o post.");
      return;
    }

    setGeneratingCaption(true);
    try {
      const res = await fetch("/api/instagram/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          tone: postTone,
          products: selectedProducts.map((product) => ({
            title: product.title,
            handle: product.handle,
            price: product.variants?.nodes?.[0]?.price || null,
            tags: product.tags || [],
            description: product.descriptionHtml || "",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao gerar post com IA.");
      setCaption(data.caption || caption);
      setSlidePlan(data.slidePlan || []);
      toast.success("Post preparado com IA.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar post com IA.");
    } finally {
      setGeneratingCaption(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-md">canal social</Badge>
            <Badge variant="outline" className="rounded-md">carrossel de produtos</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Instagram
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Conecte uma conta profissional e publique carrosséis automáticos usando
            imagens reais dos produtos da loja.
          </p>
        </div>

        <Card className="w-full border-border/60 lg:w-[360px]">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {loadingStatus
                  ? "Verificando conexão"
                  : status?.connected
                    ? `@${status.connection?.instagram_username || "instagram"}`
                    : "Instagram não conectado"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {status?.connection?.page_name || status?.error || "Professional account via Meta."}
              </p>
            </div>
            {status?.connected ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            ) : (
              // Endpoint OAuth: responde com redirect para o Instagram. Tem
              // que ser navegacao do browser — <Link> faria roteamento
              // client-side do Next e o fluxo nao sairia do app.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a
                href="/api/instagram/connect"
                className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
              >
                <Camera className="h-3.5 w-3.5" />
                Conectar
              </a>
            )}
          </CardContent>
        </Card>
      </header>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="h-4 w-4 text-primary" />
              Montar carrossel
            </CardTitle>
            <CardDescription>
              Selecione de 2 a 10 produtos com imagem pública.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={(value) => setStoreId(value || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a store">
                    {formatStoreLabel(selectedStore)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      <span className="inline-flex items-center gap-2">
                        <Store className="h-4 w-4 text-muted-foreground" />
                        {formatStoreLabel(store)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Texto do post</Label>
                <Badge variant="outline" className="rounded-md">
                  {caption.length}/2200
                </Badge>
              </div>
              <Select value={postTone} onValueChange={(value) => setPostTone(value || "natural")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural, premium e vendedor">Natural premium</SelectItem>
                  <SelectItem value="direto, promocional e com CTA">Promocional direto</SelectItem>
                  <SelectItem value="editorial, sofisticado e discreto">Editorial sofisticado</SelectItem>
                  <SelectItem value="UGC, informal e social">UGC informal</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value.slice(0, 2200))}
                rows={6}
              />
              <Button
                type="button"
                variant="outline"
                onClick={generatePostWithAi}
                disabled={generatingCaption || selectedProducts.length === 0}
                className="w-full"
              >
                {generatingCaption ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Preparar post com IA
              </Button>
            </div>

            {slidePlan.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-semibold text-foreground">
                  Plano sugerido do carrossel
                </p>
                <div className="mt-2 space-y-1.5">
                  {slidePlan.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-xs leading-5 text-muted-foreground">
                      <span className="font-mono text-foreground">{index + 1}.</span>{" "}
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
              <p>
                With 1 image, the app publishes a simple post. With 2 to 10 images, it creates a carousel. If you select only 1 product, all its images go into the carousel.
              </p>
              <p>
                The account must be a professional account and the Meta app must have permission to publish content.
              </p>
            </div>

            <Button
              onClick={publishCarousel}
              disabled={publishing || !status?.connected || selectedImageUrls.length < 1}
              className="w-full"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {selectedImageUrls.length > 1 ? "Postar carrossel" : "Postar imagem"}
            </Button>
            {lastResult ? (
              <p className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-xs text-muted-foreground">
                Published. Media ID: <span className="font-mono">{lastResult}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-lg">Produtos da loja</CardTitle>
              <CardDescription>
                O carrossel usa a primeira imagem de cada produto selecionado.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="rounded-md">
                {selectedProductIds.length}/10 selecionados
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadProducts(storeId, { notify: true })}
                disabled={loadingProducts || !storeId}
              >
                {loadingProducts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
                {loadingProducts
                  ? "Carregando produtos..."
                  : productError
                    ? productError
                    : "Nenhum produto carregado."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  const image = firstImage(product);
                  return (
                    <label
                      key={product.id}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-primary/50 bg-primary/8"
                          : "border-border/60 bg-background/45 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                          disabled={!selected && selectedProductIds.length >= 10}
                        />
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                          {image ? (
                            <Image
                              src={image}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold text-foreground">
                            {product.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {product.variants?.nodes?.[0]?.price || "no price"}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            /products/{product.handle}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <a
        href="https://developers.facebook.com/docs/instagram-platform/content-publishing/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Documentação oficial da Meta
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
