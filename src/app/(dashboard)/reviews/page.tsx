"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
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
  customerName: string;
  rating: number;
  title: string;
  body: string;
  productUseCase: string;
  disclosure: string;
  imagePrompt?: string;
  imageUrl?: string;
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

export default function ReviewsPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [count, setCount] = useState("4");
  const [tone, setTone] = useState("natural");
  const [imageStyle, setImageStyle] = useState("unboxing");
  const [includeImages, setIncludeImages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<GeneratedReview[]>([]);
  const [disclosure, setDisclosure] = useState("");

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === storeId),
    [storeId, stores]
  );

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

  async function handleGenerate() {
    if (!storeId) {
      toast.error("Selecione uma loja.");
      return;
    }
    if (!productTitle.trim()) {
      toast.error("Informe o produto.");
      return;
    }

    setLoading(true);
    setReviews([]);
    setDisclosure("");

    try {
      const res = await fetch("/api/ai/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          productTitle,
          productDescription,
          count: Number(count),
          tone,
          imageStyle,
          includeImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao gerar reviews.");

      setReviews(data.reviews || []);
      setDisclosure(data.disclosure || "");
      toast.success("Reviews sintéticos gerados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar reviews.");
    } finally {
      setLoading(false);
    }
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
              Escolha a loja, produto, quantidade e estilo visual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={(value) => setStoreId(value || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name} ({store.target_language || "pt-BR"})
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

            <div className="space-y-2">
              <Label>Produto</Label>
              <Input
                value={productTitle}
                onChange={(event) => setProductTitle(event.target.value)}
                placeholder="Ex: Colar halo de luz com moissanite"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição ou benefícios</Label>
              <Textarea
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
                rows={5}
                placeholder="Material, uso, diferenciais, público..."
              />
            </div>

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

            <Button
              onClick={handleGenerate}
              disabled={loading || !storeId || !productTitle.trim()}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : includeImages ? (
                <Camera className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "Gerando..." : "Gerar reviews"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-lg border-border/60">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg">Reviews gerados</CardTitle>
                <CardDescription>
                  Copie, exporte ou use as URLs das imagens em seus mockups.
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
