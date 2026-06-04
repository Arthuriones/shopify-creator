"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExternalLink, ImageIcon, Loader2, Pencil, RefreshCw, Save, Sparkles } from "lucide-react";

type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
type ProductStatusFilter = ProductStatus | "ALL";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  currency_code?: string | null;
}

interface ShopifyCatalogProduct {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  descriptionHtml: string;
  tags: string[];
  productType?: string | null;
  category?: { id?: string; name?: string; fullName?: string } | null;
  metafields?: {
    nodes: { namespace: string; key: string; type: string; value: string }[];
  };
  seo?: { title?: string; description?: string } | null;
  images: { nodes: { url: string; altText?: string | null }[] };
  variants: {
    nodes: {
      id: string;
      title: string;
      price: string;
      compareAtPrice?: string | null;
      selectedOptions?: { name: string; value: string }[];
    }[];
  };
}

interface VariantDraft {
  id: string;
  title: string;
  price: string;
  compareAtPrice: string;
}

interface TaxonomyPreviewItem {
  id: string;
  title: string;
  status: "preview" | "updated" | "skipped" | "failed";
  category?: string | null;
  categoryId?: string | null;
  currentCategory?: string | null;
  productType?: string | null;
  currentProductType?: string | null;
  attributes?: { name: string; key: string; value: string | string[] }[];
  metafields?: {
    namespace: string;
    key: string;
    type: string;
    value: string;
  }[];
  source?: string;
  warning?: string;
}

function formatPrice(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode || "USD"} ${value.toFixed(2)}`;
  }
}

function normalizeDecimal(value: string): string {
  const parsed = Number(value.replace(",", ".").trim());
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return parsed.toFixed(2);
}

export default function CatalogPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [products, setProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("ALL");
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [taxonomyEnriching, setTaxonomyEnriching] = useState(false);
  const [taxonomyUseAi, setTaxonomyUseAi] = useState(true);
  const [taxonomyIncludeExisting, setTaxonomyIncludeExisting] = useState(false);
  const [taxonomyPreviewOpen, setTaxonomyPreviewOpen] = useState(false);
  const [taxonomyPreview, setTaxonomyPreview] = useState<TaxonomyPreviewItem[]>([]);
  const [taxonomyApplying, setTaxonomyApplying] = useState(false);
  const [taxonomySampleProductId, setTaxonomySampleProductId] = useState("");
  const [taxonomyBulkProgress, setTaxonomyBulkProgress] = useState<{
    done: number;
    total: number;
    updated: number;
    skipped: number;
    failed: number;
    current?: string;
  } | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopifyCatalogProduct | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editSeoTitle, setEditSeoTitle] = useState("");
  const [editSeoDescription, setEditSeoDescription] = useState("");
  const [editStatus, setEditStatus] = useState<ProductStatus>("ACTIVE");
  const [editVariants, setEditVariants] = useState<VariantDraft[]>([]);

  const selectedStoreData = useMemo(
    () => stores.find((store) => store.id === selectedStore),
    [selectedStore, stores]
  );
  const activeCurrency = selectedStoreData?.currency_code || "USD";
  const taxonomySampleProduct = useMemo(
    () => products.find((product) => product.id === taxonomySampleProductId),
    [products, taxonomySampleProductId]
  );
  const taxonomyProductOptions = useMemo(
    () => products.slice(0, 50),
    [products]
  );

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, shop_domain, currency_code")
      .order("created_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: false });

      if (fallback.error) {
        toast.error("Nao foi possivel carregar as lojas.");
        setLoadingStores(false);
        return;
      }

      const normalizedFallback = (fallback.data || []).map((store) => ({
        ...store,
        currency_code: "USD",
      }));
      setStores(normalizedFallback);
      if (normalizedFallback.length === 1) {
        setSelectedStore(normalizedFallback[0].id);
      }
      setLoadingStores(false);
      return;
    }

    const normalized = (data || []).map((store) => ({
      ...store,
      currency_code: store.currency_code || "USD",
    }));

    setStores(normalized);
    if (normalized.length === 1) {
      setSelectedStore(normalized[0].id);
    }
    setLoadingStores(false);
  }, []);

  const loadProducts = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedStore) {
        setProducts([]);
        return;
      }

      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoadingProducts(true);
      }

      try {
        const params = new URLSearchParams({
          storeId: selectedStore,
          first: "120",
        });
        if (statusFilter !== "ALL") {
          params.set("status", statusFilter);
        }
        if (search.trim()) {
          params.set("search", search.trim());
        }

        const res = await fetch(`/api/shopify/products?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Nao foi possivel carregar o catalogo.");
          return;
        }

        setProducts(data.products || []);
      } catch {
        toast.error("Erro ao carregar catalogo da loja.");
      } finally {
        setLoadingProducts(false);
        setRefreshing(false);
      }
    },
    [search, selectedStore, statusFilter]
  );

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!selectedStore) return;
    void loadProducts();
  }, [loadProducts, selectedStore, statusFilter]);

  useEffect(() => {
    if (!selectedStore) return;
    const timer = setTimeout(() => {
      void loadProducts({ silent: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [loadProducts, search, selectedStore]);

  function openEditor(product: ShopifyCatalogProduct) {
    router.push(`/products?editId=${encodeURIComponent(product.id)}&storeId=${encodeURIComponent(selectedStore)}`);
  }

  function taxonomyTargetProducts() {
    return products
      .filter((product) => taxonomyIncludeExisting || !product.category?.id)
      .slice(0, 50);
  }

  async function loadTaxonomyPreview(productId: string) {
    if (!selectedStore || !productId) return;

    setTaxonomyEnriching(true);
    setTaxonomyPreview([]);
    setTaxonomyBulkProgress(null);
    try {
      const res = await fetch("/api/shopify/products/enrich-taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          storeId: selectedStore,
          productIds: [productId],
          useAiFallback: taxonomyUseAi,
          includeAlreadyCategorized: taxonomyIncludeExisting,
          limit: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Nao foi possivel gerar a previa.");
        return;
      }

      const summary = data.summary || {};
      setTaxonomyPreview((summary.products || []) as TaxonomyPreviewItem[]);
    } catch {
      toast.error("Erro ao gerar previa de categoria.");
    } finally {
      setTaxonomyEnriching(false);
    }
  }

  function handleEnrichTaxonomy() {
    if (!selectedStore) {
      toast.error("Selecione uma loja.");
      return;
    }
    if (products.length === 0) {
      toast.error("Carregue produtos antes de aplicar a correcao.");
      return;
    }

    const sample = taxonomyTargetProducts()[0] || products[0];
    setTaxonomySampleProductId(sample.id);
    setTaxonomyPreview([]);
    setTaxonomyBulkProgress(null);
    setTaxonomyPreviewOpen(true);
    void loadTaxonomyPreview(sample.id);
  }

  async function handleApplyTaxonomyPreview() {
    if (!selectedStore) return;
    const proposals = taxonomyPreview.filter((item) => item.status === "preview");
    if (proposals.length === 0) {
      toast.error("Nenhuma alteracao para aplicar.");
      return;
    }

    setTaxonomyApplying(true);
    try {
      const res = await fetch("/api/shopify/products/enrich-taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "apply",
          storeId: selectedStore,
          proposals: proposals.map((item) => ({
            productId: item.id,
            title: item.title,
            categoryId: item.categoryId || null,
            categoryName: item.category || null,
            productType: item.productType || null,
            metafields: item.metafields || [],
          })),
          limit: proposals.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Nao foi possivel aplicar categorias.");
        return;
      }

      const summary = data.summary || {};
      toast.success(
        `Categorias aplicadas: ${summary.updated || 0}. Ignorados: ${summary.skipped || 0}. Falhas: ${summary.failed || 0}.`
      );
      setTaxonomyPreviewOpen(false);
      setTaxonomyPreview([]);
      await loadProducts({ silent: true });
    } catch {
      toast.error("Erro ao aplicar categorias em massa.");
    } finally {
      setTaxonomyApplying(false);
    }
  }

  async function handleApplyTaxonomyBulk() {
    if (!selectedStore) return;
    const targets = taxonomyTargetProducts();
    if (targets.length === 0) {
      toast.error("Nenhum produto elegivel para categorizar.");
      return;
    }

    setTaxonomyApplying(true);
    setTaxonomyBulkProgress({
      done: 0,
      total: targets.length,
      updated: 0,
      skipped: 0,
      failed: 0,
    });

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (const [index, product] of targets.entries()) {
        setTaxonomyBulkProgress({
          done: index,
          total: targets.length,
          updated,
          skipped,
          failed,
          current: product.title,
        });

        const previewRes = await fetch("/api/shopify/products/enrich-taxonomy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            storeId: selectedStore,
            productIds: [product.id],
            useAiFallback: taxonomyUseAi,
            includeAlreadyCategorized: taxonomyIncludeExisting,
            limit: 1,
          }),
        });
        const previewData = await previewRes.json();
        if (!previewRes.ok) {
          failed += 1;
          continue;
        }

        const proposal = (
          (previewData.summary?.products || []) as TaxonomyPreviewItem[]
        ).find((item) => item.status === "preview");

        if (!proposal) {
          skipped += 1;
          continue;
        }

        const applyRes = await fetch("/api/shopify/products/enrich-taxonomy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "apply",
            storeId: selectedStore,
            proposals: [
              {
                productId: proposal.id,
                title: proposal.title,
                categoryId: proposal.categoryId || null,
                categoryName: proposal.category || null,
                productType: proposal.productType || null,
                metafields: proposal.metafields || [],
              },
            ],
            limit: 1,
          }),
        });
        const applyData = await applyRes.json();
        if (!applyRes.ok) {
          failed += 1;
          continue;
        }

        updated += Number(applyData.summary?.updated || 0);
        skipped += Number(applyData.summary?.skipped || 0);
        failed += Number(applyData.summary?.failed || 0);
      }

      setTaxonomyBulkProgress({
        done: targets.length,
        total: targets.length,
        updated,
        skipped,
        failed,
      });
      toast.success(
        `Categorias aplicadas: ${updated}. Ignorados: ${skipped}. Falhas: ${failed}.`
      );
      await loadProducts({ silent: true });
    } catch {
      toast.error("Erro ao aplicar categorias em massa.");
    } finally {
      setTaxonomyApplying(false);
    }
  }

  function updateVariantDraft(id: string, field: "price" | "compareAtPrice", value: string) {
    setEditVariants((prev) =>
      prev.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant
      )
    );
  }

  async function handleSave() {
    if (!selectedStore || !editingProduct) return;
    if (!editTitle.trim()) {
      toast.error("Titulo obrigatorio.");
      return;
    }
    if (!editDescription.trim()) {
      toast.error("Descricao obrigatoria.");
      return;
    }

    const normalizedVariants = editVariants.map((variant) => ({
      id: variant.id,
      price: normalizeDecimal(variant.price),
      compareAtPrice: variant.compareAtPrice.trim()
        ? normalizeDecimal(variant.compareAtPrice)
        : null,
    }));

    if (normalizedVariants.some((variant) => !variant.price)) {
      toast.error("Todas as variantes devem ter preco valido.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/shopify/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          productId: editingProduct.id,
          updates: {
            title: editTitle.trim(),
            descriptionHtml: editDescription.trim(),
            tags: editTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            seo: {
              title: editSeoTitle.trim() || editTitle.trim(),
              description: editSeoDescription.trim() || editTitle.trim(),
            },
            status: editStatus,
            variants: normalizedVariants,
            publishToStorefront: editStatus === "ACTIVE",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Nao foi possivel salvar o produto.");
        return;
      }

      toast.success("Produto atualizado com sucesso.");
      setEditorOpen(false);
      await loadProducts({ silent: true });
    } catch {
      toast.error("Erro ao salvar alteracoes.");
    } finally {
      setSaving(false);
    }
  }

  function getProductAdminUrl(productId: string): string | null {
    if (!selectedStoreData?.shop_domain) return null;
    const numericId = productId.match(/(\d+)$/)?.[1];
    if (!numericId) return null;
    return `https://${selectedStoreData.shop_domain}/admin/products/${numericId}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold text-foreground">Catalogo</h2>
        <p className="mt-1 text-base text-muted-foreground">
          Gerencie os produtos existentes da sua loja Shopify com edicao completa.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[13px] text-muted-foreground">Loja</Label>
              <Select value={selectedStore} onValueChange={(value) => setSelectedStore(value ?? "")}>
                <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                  <SelectValue placeholder={loadingStores ? "Carregando lojas..." : "Selecione a loja"} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter((value as ProductStatusFilter) ?? "ALL")}
              >
                <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Ativos</SelectItem>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="ARCHIVED">Arquivados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">Buscar</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titulo, tag, SKU..."
                className="h-10 bg-background/50 border-border/50 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedStoreData
                ? `${products.length} produto(s) carregado(s) - moeda ${activeCurrency}`
                : "Selecione uma loja para carregar o catalogo."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-9 border-border/50"
              disabled={!selectedStore || refreshing}
              onClick={() => void loadProducts({ silent: true })}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-background/35 p-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={taxonomyUseAi}
                onChange={(event) => setTaxonomyUseAi(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Sparkles className="h-4 w-4 text-primary" />
              IA quando faltar
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={taxonomyIncludeExisting}
                onChange={(event) => setTaxonomyIncludeExisting(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Sobrescrever categorizados
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-9 border-border/50"
              disabled={!selectedStore || products.length === 0}
              onClick={handleEnrichTaxonomy}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Categorizar produtos
            </Button>
            <p className="text-xs text-muted-foreground">
              Abre uma prévia de 1 produto antes de aplicar em massa.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-[13px] font-medium uppercase text-muted-foreground" style={{ letterSpacing: "0.05em" }}>
            Produtos da loja
          </CardTitle>
          <CardDescription className="text-xs">
            Abra um produto para editar titulo, descricao, SEO, status e valores das variantes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedStore ? (
            <p className="text-sm text-muted-foreground">Selecione uma loja para ver os produtos.</p>
          ) : loadingProducts ? (
            <div className="space-y-2">
              <div className="skeleton h-16 w-full rounded-md" />
              <div className="skeleton h-16 w-full rounded-md" />
              <div className="skeleton h-16 w-full rounded-md" />
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 rounded-md border border-border/40 bg-background/35 p-2.5"
                >
                  <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border/30 bg-background/50">
                    {product.images.nodes[0]?.url ? (
                      <Image
                        src={product.images.nodes[0].url}
                        alt={product.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{product.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {product.variants.nodes[0]?.price
                          ? formatPrice(Number(product.variants.nodes[0].price), activeCurrency)
                          : "Sem preco"}
                      </span>
                      <span>•</span>
                      <span>{product.status}</span>
                      <span>•</span>
                      <span>{product.variants.nodes.length} variante(s)</span>
                      {product.category?.fullName && (
                        <>
                          <span>•</span>
                          <span className="truncate">{product.category.fullName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 border-border/50 text-[11px]"
                      onClick={() => openEditor(product)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar completo
                    </Button>
                    {getProductAdminUrl(product.id) && (
                      <a
                        href={getProductAdminUrl(product.id)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center rounded-md border border-border/50 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="border-border/50 bg-card max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Editar produto do catalogo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[13px] text-muted-foreground">Titulo</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-muted-foreground">Status do produto</Label>
                <Select
                  value={editStatus}
                  onValueChange={(value) => setEditStatus((value as ProductStatus) ?? "ACTIVE")}
                >
                  <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">Descricao (HTML)</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={8}
                className="bg-background/50 border-border/50 font-mono text-xs"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[13px] text-muted-foreground">Tags (separadas por virgula)</Label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-muted-foreground">SEO titulo</Label>
                <Input
                  value={editSeoTitle}
                  onChange={(e) => setEditSeoTitle(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">SEO descricao</Label>
              <Textarea
                value={editSeoDescription}
                onChange={(e) => setEditSeoDescription(e.target.value)}
                rows={2}
                className="bg-background/50 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/40 bg-background/35 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground" style={{ letterSpacing: "0.05em" }}>
                Variantes e precos
              </p>
              {editVariants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Produto sem variantes editaveis.</p>
              ) : (
                <div className="space-y-2">
                  {editVariants.map((variant) => (
                    <div key={variant.id} className="grid gap-2 rounded-md border border-border/35 bg-background/50 p-2.5 md:grid-cols-[1.4fr_1fr_1fr]">
                      <div>
                        <p className="text-sm font-medium text-foreground">{variant.title}</p>
                        <p className="text-[11px] text-muted-foreground/80">{variant.id}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Preco</Label>
                        <Input
                          value={variant.price}
                          onChange={(e) => updateVariantDraft(variant.id, "price", e.target.value)}
                          inputMode="decimal"
                          className="h-9 bg-background/60 border-border/50 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Compare at</Label>
                        <Input
                          value={variant.compareAtPrice}
                          onChange={(e) => updateVariantDraft(variant.id, "compareAtPrice", e.target.value)}
                          inputMode="decimal"
                          className="h-9 bg-background/60 border-border/50 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                className="h-10 text-sm"
                disabled={saving}
                onClick={handleSave}
                style={{
                  background: "oklch(0.72 0.19 155)",
                  color: "oklch(0.13 0.02 155)",
                }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </span>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    Salvar alteracoes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={taxonomyPreviewOpen} onOpenChange={setTaxonomyPreviewOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] border-border/50 bg-card sm:max-w-[960px] max-h-[88vh] overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Categorizar produtos
            </DialogTitle>
          </DialogHeader>

          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border border-border/50 bg-background/35 p-3 text-sm text-muted-foreground">
              Primeiro gere uma prévia de um produto. Depois aplique só nele ou rode a correção nos produtos carregados, em pequenas etapas.
            </div>

            <div className="grid min-w-0 gap-3 rounded-lg border border-border/50 bg-background/35 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-[13px] text-muted-foreground">
                  Produto de exemplo
                </Label>
                <Select
                  value={taxonomySampleProductId}
                  onValueChange={(value) => {
                    const nextValue = value ?? "";
                    setTaxonomySampleProductId(nextValue);
                    if (nextValue) {
                      void loadTaxonomyPreview(nextValue);
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full min-w-0 bg-background/50 border-border/50 text-sm">
                    <span className="min-w-0 flex-1 truncate text-left">
                      {taxonomySampleProduct?.title || "Escolha um produto para a prévia"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-3rem)]">
                    {taxonomyProductOptions.map((product) => (
                      <SelectItem
                        key={product.id}
                        value={product.id}
                        className="min-w-0 [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:truncate [&_[data-slot=select-item-text]]:whitespace-normal"
                      >
                        {product.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={!taxonomySampleProductId || taxonomyEnriching}
                  onClick={() => loadTaxonomyPreview(taxonomySampleProductId)}
                >
                  {taxonomyEnriching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Gerar prévia
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              {taxonomyEnriching ? (
                <div className="rounded-lg border border-border/50 bg-background/35 p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                  Gerando prévia do produto escolhido...
                </div>
              ) : taxonomyPreview.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma prévia carregada.</p>
              ) : (
                taxonomyPreview.map((item) => {
                  const canApply = item.status === "preview";
                  const attributes = item.attributes || [];
                  return (
                    <div
                      key={item.id}
                      className="min-w-0 rounded-lg border border-border/50 bg-background/35 p-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Fonte: {item.source || "fonte"} · {canApply ? "pronto para aplicar" : item.status}
                          </p>
                        </div>
                        <span
                          className="w-fit rounded-md px-2 py-1 text-[11px] font-semibold uppercase"
                          style={{
                            background: canApply
                              ? "oklch(0.72 0.19 155 / 16%)"
                              : item.status === "failed"
                                ? "oklch(0.65 0.2 25 / 16%)"
                                : "oklch(0.7 0.13 250 / 16%)",
                            color: canApply
                              ? "oklch(0.72 0.19 155)"
                              : item.status === "failed"
                                ? "oklch(0.65 0.2 25)"
                                : "oklch(0.7 0.13 250)",
                          }}
                        >
                          {canApply ? "prévia" : item.status}
                        </span>
                      </div>

                      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                        <div className="min-w-0 rounded-md border border-border/40 bg-background/45 p-2.5">
                          <p className="text-[11px] font-medium uppercase text-muted-foreground">
                            Atual
                          </p>
                          <p className="mt-1 break-words text-sm text-foreground">
                            {item.currentCategory || "Sem categoria"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tipo: {item.currentProductType || "Sem tipo"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-md border border-border/40 bg-background/45 p-2.5">
                          <p className="text-[11px] font-medium uppercase text-muted-foreground">
                            Proposto
                          </p>
                          <p className="mt-1 break-words text-sm text-foreground">
                            {item.category || "Sem categoria proposta"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tipo: {item.productType || "Sem tipo"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-medium uppercase text-muted-foreground">
                          Metacampos
                        </p>
                        {attributes.length === 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Nenhum metacampo proposto.
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {attributes.slice(0, 10).map((attribute) => (
                              <span
                                key={`${item.id}-${attribute.key}`}
                                className="rounded-md border border-border/50 bg-background/55 px-2 py-1 text-xs text-muted-foreground"
                              >
                                {attribute.name}:{" "}
                                {Array.isArray(attribute.value)
                                  ? attribute.value.join(", ")
                                  : attribute.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {item.warning && (
                        <p className="mt-3 text-xs text-amber-500">{item.warning}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {taxonomyBulkProgress && (
              <div className="rounded-lg border border-border/50 bg-background/35 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="font-medium text-foreground">
                    Progresso da aplicação em massa
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {taxonomyBulkProgress.done}/{taxonomyBulkProgress.total}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.round(
                        (taxonomyBulkProgress.done /
                          Math.max(taxonomyBulkProgress.total, 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {taxonomyBulkProgress.current
                    ? `Processando: ${taxonomyBulkProgress.current}`
                    : `Aplicados: ${taxonomyBulkProgress.updated}. Ignorados: ${taxonomyBulkProgress.skipped}. Falhas: ${taxonomyBulkProgress.failed}.`}
                </p>
              </div>
            )}

            <div className="grid gap-2 border-t border-border/50 pt-4 sm:flex sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setTaxonomyPreviewOpen(false)}
                disabled={taxonomyApplying}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleApplyTaxonomyPreview}
                disabled={
                  taxonomyApplying ||
                  taxonomyEnriching ||
                  !taxonomyPreview.some((item) => item.status === "preview")
                }
                variant="outline"
                className="w-full sm:w-auto"
              >
                {taxonomyApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Aplicar este produto
              </Button>
              <Button
                type="button"
                onClick={handleApplyTaxonomyBulk}
                disabled={
                  taxonomyApplying ||
                  taxonomyEnriching ||
                  taxonomyTargetProducts().length === 0
                }
                className="w-full sm:w-auto"
              >
                {taxonomyApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Aplicar nos carregados
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
