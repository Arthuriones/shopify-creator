"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Copy,
  Edit3,
  Download,
  FileJson,
  FileOutput,
  GitBranch,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Route,
  ShieldCheck,
  Store,
  Trash2,
  WandSparkles,
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
}

interface PreviewProduct {
  id: number;
  title: string;
  handle: string;
  images: { src: string }[];
  variants: { id: number; sku: string | null; price: string }[];
  sourceUrl: string;
}

interface CheckoutConfig {
  id: string;
  name: string;
  mode: string;
  public_token: string;
  enabled: boolean;
  source_store_id: string;
  target_store_id: string;
  sku_map: Record<string, string>;
  variant_map: Record<string, string>;
}

interface CloneRun {
  id: string;
  source_domain: string;
  action: string;
  status: string;
  product_count: number;
  result: {
    createdCount?: number;
    skippedCount?: number;
    failedCount?: number;
    skuMapCount?: number;
    variantMapCount?: number;
  } | null;
  created_at: string;
}

type CloneView = "overview" | "shopify" | "export" | "routed-checkout";

interface ConnectedVariant {
  id: string;
  title: string;
  sku?: string | null;
  price?: string;
  selectedOptions?: { name: string; value: string }[];
}

interface ConnectedProduct {
  id: string;
  title: string;
  handle: string;
  status?: string;
  variants: { nodes: ConnectedVariant[] };
}

interface FlatVariant extends ConnectedVariant {
  productTitle: string;
  productHandle: string;
  label: string;
}

const DEFAULT_SKU_MAP = "{}";

const DEFAULT_VARIANT_MAP = "{}";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseJsonMap(value: string, label: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, string>;
  } catch {
    throw new Error(`${label} precisa ser um JSON objeto valido.`);
  }
}

function safeJsonMap(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function normalizeMatchKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikeGeneratedId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function looksLikeDomain(value: string) {
  return /\.|myshopify\.com|shopify\.com/i.test(value);
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

function flattenVariants(products: ConnectedProduct[]): FlatVariant[] {
  return products.flatMap((product) =>
    (product.variants?.nodes || []).map((variant) => {
      const optionText =
        variant.selectedOptions
          ?.map((option) => option.value)
          .filter(Boolean)
          .join(" / ") || variant.title;
      return {
        ...variant,
        productTitle: product.title,
        productHandle: product.handle,
        label: `${product.title}${optionText && optionText !== "Default Title" ? ` - ${optionText}` : ""}`,
      };
    })
  );
}

function buildSuggestedMaps(
  sourceProducts: ConnectedProduct[],
  targetProducts: ConnectedProduct[]
) {
  const sourceVariants = flattenVariants(sourceProducts);
  const targetVariants = flattenVariants(targetProducts);
  const targetBySku = new Map<string, FlatVariant>();
  const targetByLabel = new Map<string, FlatVariant>();

  targetVariants.forEach((variant) => {
    if (variant.sku?.trim()) {
      targetBySku.set(variant.sku.trim().toLowerCase(), variant);
    }
    targetByLabel.set(normalizeMatchKey(variant.label), variant);
  });

  const skuMap: Record<string, string> = {};
  const variantMap: Record<string, string> = {};
  const matches: {
    source: FlatVariant;
    target: FlatVariant;
    reason: "sku" | "titulo";
  }[] = [];
  const unmatched: FlatVariant[] = [];

  sourceVariants.forEach((sourceVariant) => {
    const sku = sourceVariant.sku?.trim();
    const targetVariant = sku
      ? targetBySku.get(sku.toLowerCase())
      : targetByLabel.get(normalizeMatchKey(sourceVariant.label));

    if (targetVariant) {
      if (sku) skuMap[sku] = targetVariant.id;
      variantMap[sourceVariant.id] = targetVariant.id;
      matches.push({
        source: sourceVariant,
        target: targetVariant,
        reason: sku ? "sku" : "titulo",
      });
    } else {
      unmatched.push(sourceVariant);
    }
  });

  return { sourceVariants, targetVariants, skuMap, variantMap, matches, unmatched };
}

function formatStoreLabel(store?: StoreOption) {
  if (!store) return "Selecione uma loja";
  const name = store.name?.trim();
  if (name && name !== store.id && !looksLikeGeneratedId(name) && !looksLikeDomain(name)) {
    return name;
  }
  const domainLabel = formatDomainLabel(store.shop_domain || name);
  if (domainLabel) return domainLabel;
  return `Loja ${store.id.slice(0, 8)}`;
}

function formatJsonMap(map: Record<string, string>) {
  return JSON.stringify(map || {}, null, 2);
}

function ServiceIntro({
  icon: Icon,
  title,
  description,
  steps,
}: {
  icon: typeof Copy;
  title: string;
  description: string;
  steps: string[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex min-w-0 items-start gap-2 rounded-lg border border-border/50 bg-background/45 p-3"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <span className="leading-5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
      <code>{children}</code>
    </pre>
  );
}

function ServiceOverview() {
  const services = [
    {
      href: "/clone/shopify",
      icon: Copy,
      title: "Clonar loja Shopify",
      description:
        "Importe produtos de uma vitrine pública via /products.json, veja a prévia e aplique em uma loja conectada.",
      bullets: ["Origem pública", "Prévia antes de gravar", "Aplicação em loja conectada"],
    },
    {
      href: "/clone/export",
      icon: FileOutput,
      title: "Exportar catálogo",
      description:
        "Gere arquivos JSON ou CSV da origem informada para backup, revisão em planilha ou importação manual.",
      bullets: ["JSON completo", "CSV operacional", "Histórico de execuções"],
    },
    {
      href: "/clone/routed-checkout",
      icon: GitBranch,
      title: "Routed checkout",
      description:
        "Faça uma vitrine vender enquanto o checkout final é montado na dark store com variantes mapeadas.",
      bullets: ["SKU map", "Variant map", "Script no tema"],
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {services.map((service) => (
        <Link
          key={service.href}
          href={service.href}
          className="group rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary/45 hover:bg-card/80"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <service.icon className="h-4 w-4" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            {service.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {service.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {service.bullets.map((bullet) => (
              <Badge key={bullet} variant="outline" className="rounded-md">
                {bullet}
              </Badge>
            ))}
          </div>
        </Link>
      ))}
    </section>
  );
}

function RoutedCheckoutTutorial({
  installSnippet,
  routeToken,
}: {
  installSnippet: string;
  routeToken: string;
}) {
  const plainMeaning = [
    {
      title: "Vitrine",
      detail:
        "É a loja que o cliente vê, navega e adiciona produtos ao carrinho. O script é instalado aqui.",
    },
    {
      title: "Dark store",
      detail:
        "É a loja que realmente recebe o checkout/pedido. Ela precisa ter produtos equivalentes aos da vitrine.",
    },
    {
      title: "Mapa",
      detail:
        "É a tabela que diz: este SKU ou variant da vitrine vira esta variant da dark store.",
    },
  ];

  const mapTerms = [
    {
      title: "SKU",
      detail:
        "É o código interno/comercial da variante. Você encontra no admin da Shopify em Products > produto > Variant > Inventory/SKU. Se a vitrine e a dark store usam o mesmo SKU, o mapa pode ser gerado sozinho.",
    },
    {
      title: "Variant GID",
      detail:
        "É o identificador global da variante na API Admin da Shopify, no formato gid://shopify/ProductVariant/123. Esta tela lê esse valor pela API e mostra nas tabelas de variantes.",
    },
    {
      title: "SKU map",
      detail:
        "Chave = SKU da vitrine. Valor = Variant GID da dark store. É o jeito mais simples quando os SKUs da vitrine estão preenchidos.",
    },
    {
      title: "Variant map",
      detail:
        "Chave = Variant GID da vitrine. Valor = Variant GID da dark store. Use quando não houver SKU confiável ou quando quiser mapear item por item.",
    },
  ];

  const modeGuide = [
    {
      title: "standard",
      detail:
        "Modo simples de teste. Usa os mapas e envia para a dark store escolhida, sem regras avançadas.",
    },
    {
      title: "enterprise",
      detail:
        "Reservado para cenários com várias vitrines/dark stores e regras por campanha, país, estoque ou fonte. Hoje usa a mesma resolução por mapas.",
    },
    {
      title: "enterprise_static",
      detail:
        "Recomendado para este fluxo. Mantém uma vitrine ligada a uma dark store fixa e previsível.",
    },
  ];

  const flow = [
    "Cliente adiciona produtos na loja vitrine.",
    "O script intercepta o clique ou envio do checkout.",
    "A vitrine envia token e linhas do carrinho para /api/checkout-routes/resolve.",
    "O app troca SKU/variant da vitrine pelas variantes da dark store.",
    "O cliente é enviado ao checkout da dark store sem perceber a troca.",
  ];

  const installSteps = [
    {
      title: "Abrir o arquivo certo",
      detail:
        "Na Shopify da loja vitrine, entre em Online Store > Themes > ... > Edit code e abra layout/theme.liquid.",
    },
    {
      title: "Renderizar antes do fechamento do body",
      detail:
        "Cole o script pronto exatamente antes de </body>. Esse é o mesmo local indicado na referência.",
    },
    {
      title: "Usar o token da rota",
      detail:
        "O atributo data-token recebe o token público da rota. Ele é gerado automaticamente quando você cria a rota e identifica qual mapeamento este script deve usar.",
    },
    {
      title: "Ajustar o carrinho nativo",
      detail:
        "No Dawn e temas grátis, troque Cart type para Pop-up notification. Em temas pagos, procure Cart ou Product notifications.",
    },
  ];

  const tokenGuide = [
    {
      title: "O que é",
      detail:
        "É um identificador público da configuração de roteamento. Ele não é a senha da Shopify e não dá acesso ao admin; ele só aponta para uma rota ativa deste app.",
    },
    {
      title: "Como gera",
      detail:
        "Escolha vitrine, dark store, modo e mapas. Depois clique em Criar rota. O app salva a rota e cria o token automaticamente.",
    },
    {
      title: "Onde pega",
      detail:
        "Depois de criar a rota, esta tela preenche o código pronto. Você também pode copiar pela lista de Rotas ativas quando houver uma rota habilitada.",
    },
    {
      title: "Onde coloca",
      detail:
        "Cole no atributo data-token do script dentro de layout/theme.liquid, na loja vitrine, imediatamente antes de </body>.",
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-lg border-primary/30 bg-primary/8">
        <CardHeader>
          <CardTitle className="text-xl">
            O que este recurso faz?
          </CardTitle>
          <CardDescription>
            Ele deixa uma loja vender como vitrine, mas manda o cliente pagar em outra loja. O cliente vê a vitrine normal; só no clique de checkout o carrinho é recriado na dark store com os produtos equivalentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {plainMeaning.map((item) => (
            <div key={item.title} className="rounded-lg border border-border/60 bg-card/80 p-4">
              <p className="font-heading text-base font-bold text-foreground">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Token da rota
          </CardTitle>
          <CardDescription>
            É o valor que liga o script instalado na vitrine à rota salva neste painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {tokenGuide.map((item) => (
            <div key={item.title} className="rounded-lg border border-border/60 bg-background/45 p-4">
              <p className="font-heading text-sm font-bold text-foreground">
                {item.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">SKU, GID e modos</CardTitle>
          <CardDescription>
            Esses nomes aparecem porque o checkout precisa saber exatamente qual variante da dark store deve substituir cada item da vitrine.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-4">
          {mapTerms.map((item) => (
            <div key={item.title} className="rounded-lg border border-border/60 bg-background/45 p-4">
              <p className="font-heading text-sm font-bold text-foreground">
                {item.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-primary/25 bg-primary/8 p-4 lg:col-span-4">
            <p className="font-heading text-sm font-bold text-foreground">
              Diferença dos modos
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {modeGuide.map((item) => (
                <div key={item.title} className="rounded-lg border border-border/60 bg-card/80 p-3">
                  <code className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                    {item.title}
                  </code>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="h-4 w-4 text-primary" />
              Tutorial: como o roteamento funciona
            </CardTitle>
            <CardDescription>
              Fluxo prático inspirado no documento HeroCart anexado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-background/45 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Fluxo do pedido
              </h3>
              <ol className="mt-3 space-y-2">
                {flow.map((item, index) => (
                  <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="leading-6">{item}</span>
                  </li>
                ))}
              </ol>
            </div>

          <div className="grid gap-3 md:grid-cols-3">
            {modeGuide.map((item) => (
              <div key={item.title} className="rounded-lg border border-border/60 bg-background/45 p-3">
                <code className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                  {item.title}
                </code>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="h-4 w-4 text-primary" />
            Instalação do script
          </CardTitle>
          <CardDescription>
            Instale na loja vitrine. Não use cartoriginals.web.app: aquele loader carrega o app da referência, não este projeto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            {installSteps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-lg border border-border/60 bg-background/45 p-3"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-xs text-primary">
                    {index + 1}
                  </span>
                  {step.title}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card
        id="routed-script"
        className="scroll-mt-6 rounded-lg border-border/60 xl:col-span-2"
      >
        <CardHeader>
          <CardTitle className="text-lg">Código pronto para colar no tema</CardTitle>
          <CardDescription>
            Cole no arquivo <code>layout/theme.liquid</code>, imediatamente antes de <code>&lt;/body&gt;</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Instalação rápida</Label>
            <CodeBlock>{installSnippet}</CodeBlock>
            <p className="text-sm leading-6 text-muted-foreground">
              Cole tudo. Em uso normal, você só muda o <code>data-token</code> se criar outra rota. O <code>src</code> deve apontar para o domínio público deste app.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Token usado agora: {routeToken || "crie ou selecione uma rota para gerar o token real"}.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Checklist de teste</Label>
            <CodeBlock>{`1. Salve o theme.liquid
2. Abra a vitrine em janela anonima
3. Adicione um produto mapeado ao carrinho
4. Clique em checkout
5. Confira se a URL final é da dark store`}</CodeBlock>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

export default function ClonePage() {
  const pathname = usePathname();
  const [routedSection, setRoutedSection] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState("50");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [createRoutingConfig, setCreateRoutingConfig] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"json" | "csv" | null>(null);
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [sourceDomain, setSourceDomain] = useState("");

  const [configs, setConfigs] = useState<CheckoutConfig[]>([]);
  const [cloneRuns, setCloneRuns] = useState<CloneRun[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [routeName, setRouteName] = useState("Vitrine para dark store");
  const [routeSourceStoreId, setRouteSourceStoreId] = useState("");
  const [routeTargetStoreId, setRouteTargetStoreId] = useState("");
  const [routeMode, setRouteMode] = useState("enterprise_static");
  const [skuMap, setSkuMap] = useState(DEFAULT_SKU_MAP);
  const [variantMap, setVariantMap] = useState(DEFAULT_VARIANT_MAP);
  const [routeSaving, setRouteSaving] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState("");
  const [deletingRouteId, setDeletingRouteId] = useState("");
  const [destinationCreating, setDestinationCreating] = useState(false);
  const [neutralizeDestinationProducts, setNeutralizeDestinationProducts] =
    useState(false);
  const [sourceProducts, setSourceProducts] = useState<ConnectedProduct[]>([]);
  const [targetProducts, setTargetProducts] = useState<ConnectedProduct[]>([]);
  const [routeProductsLoading, setRouteProductsLoading] = useState(false);
  const [routeProductsError, setRouteProductsError] = useState("");
  const [routeProductsRefreshKey, setRouteProductsRefreshKey] = useState(0);
  const [appOrigin, setAppOrigin] = useState("");
  const [autofilledMapKey, setAutofilledMapKey] = useState("");

  const activeView: CloneView = pathname.endsWith("/shopify")
    ? "shopify"
    : pathname.endsWith("/export")
      ? "export"
      : pathname.endsWith("/routed-checkout")
        ? "routed-checkout"
      : "overview";

  useEffect(() => {
    const readRoutedSection = () => {
      setRoutedSection(
        new URLSearchParams(window.location.search).get("section") || ""
      );
    };

    const handleSidebarSection = (event: Event) => {
      setRoutedSection((event as CustomEvent<string>).detail || "");
    };

    readRoutedSection();
    window.addEventListener("popstate", readRoutedSection);
    window.addEventListener("routed-checkout-section", handleSidebarSection);
    return () => {
      window.removeEventListener("popstate", readRoutedSection);
      window.removeEventListener("routed-checkout-section", handleSidebarSection);
    };
  }, [pathname]);

  useEffect(() => {
    if (activeView !== "routed-checkout" || !routedSection) return;
    const target = document.getElementById(`routed-${routedSection}`);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeView, routedSection]);

  const pageMeta = {
    overview: {
      title: "Central de clone e checkout",
      description:
        "Escolha um recurso independente: clonar produtos, exportar catálogo ou configurar routed checkout.",
    },
    shopify: {
      title: "Clone de loja Shopify",
      description:
        "Importe produtos de uma vitrine pública e aplique em uma loja conectada.",
    },
    export: {
      title: "Exportar catálogo",
      description:
        "Gere JSON ou CSV a partir de uma origem Shopify pública para revisão e backup.",
    },
    "routed-checkout": {
      title: "Routed checkout",
      description:
        "Roteie pedidos da vitrine para o checkout da dark store com mapas de SKU e variant.",
    },
  }[activeView];

  const selectedTarget = useMemo(
    () => stores.find((store) => store.id === targetStoreId),
    [stores, targetStoreId]
  );

  const selectedSourceStore = useMemo(
    () => stores.find((store) => store.id === sourceStoreId),
    [stores, sourceStoreId]
  );

  const selectedRouteSourceStore = useMemo(
    () => stores.find((store) => store.id === routeSourceStoreId),
    [stores, routeSourceStoreId]
  );

  const selectedRouteTargetStore = useMemo(
    () => stores.find((store) => store.id === routeTargetStoreId),
    [stores, routeTargetStoreId]
  );

  const selectedRouteConfig = useMemo(
    () =>
      configs.find(
        (config) =>
          config.source_store_id === routeSourceStoreId &&
          config.target_store_id === routeTargetStoreId &&
          config.enabled
      ) || null,
    [configs, routeSourceStoreId, routeTargetStoreId]
  );

  const suggestedRouteMaps = useMemo(
    () => buildSuggestedMaps(sourceProducts, targetProducts),
    [sourceProducts, targetProducts]
  );

  const sourceVariantSamples = useMemo(
    () => suggestedRouteMaps.sourceVariants.slice(0, 12),
    [suggestedRouteMaps.sourceVariants]
  );

  const targetVariantSamples = useMemo(
    () => suggestedRouteMaps.targetVariants.slice(0, 12),
    [suggestedRouteMaps.targetVariants]
  );

  const manualSourceVariants = useMemo(
    () => suggestedRouteMaps.sourceVariants.slice(0, 40),
    [suggestedRouteMaps.sourceVariants]
  );

  const currentVariantMap = useMemo(
    () => safeJsonMap(variantMap),
    [variantMap]
  );

  const targetVariantById = useMemo(
    () =>
      new Map(
        suggestedRouteMaps.targetVariants.map((variant) => [variant.id, variant])
      ),
    [suggestedRouteMaps.targetVariants]
  );

  const routeLinkRows = useMemo(
    () =>
      manualSourceVariants.map((sourceVariant) => {
        const manualTargetId = currentVariantMap[sourceVariant.id];
        const suggestedMatch = suggestedRouteMaps.matches.find(
          (match) => match.source.id === sourceVariant.id
        );
        const targetVariant = manualTargetId
          ? targetVariantById.get(manualTargetId)
          : suggestedMatch?.target;
        return {
          source: sourceVariant,
          target: targetVariant || null,
          targetId: manualTargetId || suggestedMatch?.target.id || "__none__",
          reason: manualTargetId ? "manual" : suggestedMatch?.reason || "sem-par",
        };
      }),
    [
      currentVariantMap,
      manualSourceVariants,
      suggestedRouteMaps.matches,
      targetVariantById,
    ]
  );

  const routeMapKey = useMemo(
    () =>
      `${routeSourceStoreId}:${routeTargetStoreId}:${suggestedRouteMaps.matches.length}:${suggestedRouteMaps.sourceVariants.length}:${suggestedRouteMaps.targetVariants.length}`,
    [
      routeSourceStoreId,
      routeTargetStoreId,
      suggestedRouteMaps.matches.length,
      suggestedRouteMaps.sourceVariants.length,
      suggestedRouteMaps.targetVariants.length,
    ]
  );

  const installToken = selectedRouteConfig?.public_token || "";
  const installSnippet = `<script
  src="${appOrigin || "https://seu-app.com"}/routed-checkout-loader.js"
  data-token="${installToken || "COLE_O_TOKEN_DA_ROTA"}"
  async>
</script>`;

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Nao foi possivel carregar suas lojas.");
      }

      const loadedStores = data || [];
      setStores(loadedStores);
      if (loadedStores[0]) {
        setTargetStoreId(loadedStores[0].id);
        setSourceStoreId(loadedStores[0].id);
        setRouteSourceStoreId(loadedStores[0].id);
      }
      if (loadedStores[1]) {
        setRouteTargetStoreId(loadedStores[1].id);
      }
      setStoresLoading(false);
    }

    void loadStores();
  }, []);

  async function loadConfigs() {
    setConfigsLoading(true);
    try {
      const res = await fetch("/api/checkout-routes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar rotas.");
      setConfigs(data.configs || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar rotas.");
    } finally {
      setConfigsLoading(false);
    }
  }

  async function loadCloneRuns() {
    const supabase = createClient();
    const { data } = await supabase
      .from("clone_runs")
      .select("id, source_domain, action, status, product_count, result, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    setCloneRuns((data || []) as CloneRun[]);
  }

  useEffect(() => {
    void loadConfigs();
    void loadCloneRuns();
  }, []);

  useEffect(() => {
    if (activeView !== "routed-checkout" || !routeSourceStoreId || !routeTargetStoreId) {
      return;
    }

    if (routeSourceStoreId === routeTargetStoreId) {
      setRouteProductsError("Escolha lojas diferentes: a vitrine e a dark store não podem ser a mesma loja.");
      setSourceProducts([]);
      setTargetProducts([]);
      return;
    }

    let cancelled = false;

    async function loadRouteProducts() {
      setRouteProductsLoading(true);
      setRouteProductsError("");
      try {
        const [sourceRes, targetRes] = await Promise.all([
          fetch(`/api/shopify/products?storeId=${routeSourceStoreId}&first=250`),
          fetch(`/api/shopify/products?storeId=${routeTargetStoreId}&first=250`),
        ]);
        const [sourceData, targetData] = await Promise.all([
          sourceRes.json(),
          targetRes.json(),
        ]);

        if (!sourceRes.ok) {
          throw new Error(sourceData.error || "Nao foi possivel carregar produtos da vitrine.");
        }
        if (!targetRes.ok) {
          throw new Error(targetData.error || "Nao foi possivel carregar produtos da dark store.");
        }

        if (!cancelled) {
          setSourceProducts((sourceData.products || []) as ConnectedProduct[]);
          setTargetProducts((targetData.products || []) as ConnectedProduct[]);
        }
      } catch (error) {
        if (!cancelled) {
          setRouteProductsError(
            error instanceof Error ? error.message : "Falha ao carregar produtos reais."
          );
          setSourceProducts([]);
          setTargetProducts([]);
        }
      } finally {
        if (!cancelled) setRouteProductsLoading(false);
      }
    }

    void loadRouteProducts();

    return () => {
      cancelled = true;
    };
  }, [activeView, routeProductsRefreshKey, routeSourceStoreId, routeTargetStoreId]);

  useEffect(() => {
    if (activeView !== "routed-checkout") return;
    if (!routeMapKey || routeMapKey === autofilledMapKey) return;
    if (editingRouteId) return;
    if (suggestedRouteMaps.matches.length === 0) return;

    setSkuMap(formatJsonMap(suggestedRouteMaps.skuMap));
    setVariantMap(formatJsonMap(suggestedRouteMaps.variantMap));
    setAutofilledMapKey(routeMapKey);
  }, [activeView, autofilledMapKey, editingRouteId, routeMapKey, suggestedRouteMaps]);

  async function runClone(action: "preview" | "export-json" | "export-csv" | "apply") {
    const payload = {
      source,
      action,
      sourceStoreId,
      targetStoreId,
      limit: Number(limit || 50),
      publishToStorefront,
      duplicatePolicy,
      createRoutingConfig,
    };

    const res = await fetch("/api/shopify/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (action === "export-csv") {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao exportar CSV.");
      }
      return { blob: await res.blob() };
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no clone.");
    return data;
  }

  async function handlePreview() {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }

    setPreviewLoading(true);
    try {
      const data = await runClone("preview");
      setPreview(data.products || []);
      setSourceDomain(data.sourceDomain || "");
      toast.success(`${data.count || 0} produtos encontrados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao analisar loja.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport(format: "json" | "csv") {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }

    setExportLoading(format);
    try {
      if (format === "csv") {
        const data = await runClone("export-csv");
        downloadBlob(`${sourceDomain || "shopify"}-products.csv`, data.blob);
      } else {
        const data = await runClone("export-json");
        downloadBlob(
          `${data.sourceDomain || "shopify"}-products.json`,
          new Blob([JSON.stringify(data.products || [], null, 2)], {
            type: "application/json",
          })
        );
      }
      toast.success(`Export ${format.toUpperCase()} gerado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar.");
    } finally {
      setExportLoading(null);
    }
  }

  async function handleApply() {
    if (!source.trim() || !targetStoreId) {
      toast.error("Informe origem e destino.");
      return;
    }

    setApplyLoading(true);
    try {
      const data = await runClone("apply");
      toast.success(`${data.createdCount || 0} produtos aplicados em ${selectedTarget?.name || "Shopify"}.`);
      if (data.failedCount) {
        toast.error(`${data.failedCount} produtos falharam.`);
      }
      await Promise.all([loadConfigs(), loadCloneRuns()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao aplicar clone.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Nao foi possivel copiar ${label}.`);
    }
  }

  function resetRouteForm() {
    setEditingRouteId("");
    setRouteName("Vitrine para dark store");
    setRouteMode("enterprise_static");
    setSkuMap(DEFAULT_SKU_MAP);
    setVariantMap(DEFAULT_VARIANT_MAP);
  }

  function loadRouteForEditing(config: CheckoutConfig) {
    setEditingRouteId(config.id);
    setRouteName(config.name);
    setRouteSourceStoreId(config.source_store_id);
    setRouteTargetStoreId(config.target_store_id);
    setRouteMode(config.mode || "enterprise_static");
    setSkuMap(formatJsonMap(config.sku_map || {}));
    setVariantMap(formatJsonMap(config.variant_map || {}));
    toast.success("Rota carregada para edicao.");
  }

  async function handleDeleteRoute(config: CheckoutConfig) {
    const confirmed = window.confirm(`Excluir a rota "${config.name}"?`);
    if (!confirmed) return;

    setDeletingRouteId(config.id);
    try {
      const res = await fetch("/api/checkout-routes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: config.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao excluir rota.");
      if (editingRouteId === config.id) resetRouteForm();
      toast.success("Rota excluida.");
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir rota.");
    } finally {
      setDeletingRouteId("");
    }
  }

  async function handleCreateDestinationProducts() {
    if (!routeSourceStoreId || !routeTargetStoreId) {
      toast.error("Escolha vitrine e dark store.");
      return;
    }

    if (routeSourceStoreId === routeTargetStoreId) {
      toast.error("A dark store precisa ser diferente da vitrine.");
      return;
    }

    setDestinationCreating(true);
    try {
      const res = await fetch("/api/checkout-routes/create-destination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStoreId: routeSourceStoreId,
          targetStoreId: routeTargetStoreId,
          limit: 50,
          neutralizeProducts: neutralizeDestinationProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar destino.");

      setSkuMap(formatJsonMap(data.skuMap || {}));
      setVariantMap(formatJsonMap(data.variantMap || {}));
      setRouteProductsRefreshKey((key) => key + 1);
      toast.success(
        `${data.createdCount || 0} produto(s) criados e ${data.skippedCount || 0} reaproveitados na dark store.`
      );
      if (data.neutralizedCount) {
        toast.success(`${data.neutralizedCount} produto(s) neutralizados com IA.`);
      }
      if (data.failedCount) {
        toast.error(`${data.failedCount} produto(s) falharam ao criar destino.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar destino.");
    } finally {
      setDestinationCreating(false);
    }
  }

  async function handleCreateRoute() {
    if (!routeSourceStoreId || !routeTargetStoreId || !routeName.trim()) {
      toast.error("Preencha nome, vitrine e dark store.");
      return;
    }

    if (routeSourceStoreId === routeTargetStoreId) {
      toast.error("A vitrine e a dark store precisam ser lojas diferentes.");
      return;
    }

    setRouteSaving(true);
    try {
      const res = await fetch("/api/checkout-routes", {
        method: editingRouteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRouteId || undefined,
          name: routeName,
          sourceStoreId: routeSourceStoreId,
          targetStoreId: routeTargetStoreId,
          mode: routeMode,
          skuMap: parseJsonMap(skuMap, "SKU map"),
          variantMap: parseJsonMap(variantMap, "Variant map"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar rota.");
      toast.success(editingRouteId ? "Checkout roteado atualizado." : "Checkout roteado criado.");
      setEditingRouteId(data.config?.id || editingRouteId);
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar rota.");
    } finally {
      setRouteSaving(false);
    }
  }

  function handleRouteSourceChange(value: string | null) {
    const nextSource = value || "";
    if (nextSource && nextSource === routeTargetStoreId) {
      setRouteSourceStoreId(nextSource);
      setRouteTargetStoreId(routeSourceStoreId);
      return;
    }
    setRouteSourceStoreId(nextSource);
  }

  function handleRouteTargetChange(value: string | null) {
    const nextTarget = value || "";
    if (nextTarget && nextTarget === routeSourceStoreId) {
      setRouteTargetStoreId(nextTarget);
      setRouteSourceStoreId(routeTargetStoreId);
      return;
    }
    setRouteTargetStoreId(nextTarget);
  }

  function handleManualVariantLink(sourceVariantId: string, targetVariantId: string | null) {
    const nextMap = safeJsonMap(variantMap);
    if (!targetVariantId || targetVariantId === "__none__") {
      delete nextMap[sourceVariantId];
    } else {
      nextMap[sourceVariantId] = targetVariantId;
    }
    setVariantMap(formatJsonMap(nextMap));
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              multi-fonte
            </Badge>
            <Badge variant="outline" className="rounded-md">
              routed checkout
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {pageMeta.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {pageMeta.description}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
          {[
            ["1", "Clone", "Importa produtos de uma loja pública."],
            ["2", "Exportação", "Gera JSON ou CSV para análise."],
            ["3", "Checkout", "Liga vitrine e dark store."],
          ].map(([number, title, description]) => (
            <div
              key={number}
              className="rounded-lg border border-border/60 bg-card/70 p-3"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-xs text-primary">
                  {number}
                </span>
                {title}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </header>

      {activeView === "overview" && <ServiceOverview />}

      {activeView === "shopify" && (
      <section className="space-y-4" aria-labelledby="clone-shopify">
        <ServiceIntro
          icon={Copy}
          title="Serviço 1: clonar loja Shopify"
          description="Use quando quiser copiar produtos de uma vitrine pública. A origem pode ser um domínio próprio ou myshopify.com; o sistema busca o catálogo público e mostra uma prévia antes de gravar algo."
          steps={[
            "Informe a loja pública de origem.",
            "Analise a prévia para conferir produtos e variantes.",
            "Aplique na loja conectada ou exporte o catálogo.",
          ]}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="rounded-lg border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PackageCheck className="h-4 w-4 text-primary" />
                Configurar clone
              </CardTitle>
              <CardDescription>
                Nada é publicado antes de clicar em Aplicar na loja.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_128px]">
                <div className="space-y-2">
                  <Label htmlFor="source">Loja de origem</Label>
                  <Input
                    id="source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="exemplo.myshopify.com ou dominio.com"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Use apenas o domínio; a busca pública usa /products.json.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limit">Limite</Label>
                  <Input
                    id="limit"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    inputMode="numeric"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Máximo por execução.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Destino conectado</Label>
                  <Select value={targetStoreId} onValueChange={(value) => setTargetStoreId(value || "")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Selecione uma loja">
                        {formatStoreLabel(selectedTarget)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          <span className="block max-w-[320px] truncate">
                            {formatStoreLabel(store)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Loja onde os produtos serão criados.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Duplicados</Label>
                  <Select value={duplicatePolicy} onValueChange={(value) => setDuplicatePolicy(value || "skip")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="skip">Pular existentes</SelectItem>
                      <SelectItem value="create">Criar mesmo assim</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Evita produtos repetidos quando a origem já foi clonada.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                <label className="flex min-h-16 items-start gap-3 rounded-lg border border-border/70 bg-background/45 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={publishToStorefront}
                    onChange={(event) => setPublishToStorefront(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Publicar na loja
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      Produtos entram disponíveis na Shopify de destino.
                    </span>
                  </span>
                </label>

                <div className="space-y-2 rounded-lg border border-border/70 bg-background/45 p-3">
                  <Label>Vitrine para mapear</Label>
                  <Select value={sourceStoreId} onValueChange={(value) => setSourceStoreId(value || "")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Loja vitrine">
                        {formatStoreLabel(selectedSourceStore)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          <span className="block max-w-[260px] truncate">
                            {formatStoreLabel(store)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Origem do mapa quando a rota automática for criada.
                  </p>
                </div>

                <label className="flex min-h-16 items-start gap-3 rounded-lg border border-border/70 bg-background/45 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={createRoutingConfig}
                    onChange={(event) => setCreateRoutingConfig(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Preparar rota de checkout
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      Salva mapas para ligar vitrine e dark store depois.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button onClick={handlePreview} disabled={previewLoading || storesLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  Analisar origem
                </Button>
                <Button onClick={handleApply} disabled={applyLoading || !targetStoreId}>
                  {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                  Aplicar na loja
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Prévia</CardTitle>
            <CardDescription>
              {sourceDomain ? `${sourceDomain} - ${preview.length} produtos` : "Nenhuma origem analisada"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview.length === 0 ? (
              <EmptyState>
                Depois de analisar, os primeiros produtos aparecem aqui com imagem,
                preço e quantidade de variantes.
              </EmptyState>
            ) : (
              <div className="max-h-[430px] space-y-2 overflow-auto pr-1">
                {preview.slice(0, 30).map((product) => (
                  <a
                    key={product.id}
                    href={product.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-3 rounded-lg border border-border/60 bg-background/45 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {product.images[0]?.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0].src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {product.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.variants.length} variantes · {product.variants[0]?.price || "0.00"}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </section>
      )}

      {activeView === "export" && (
      <section className="space-y-4" aria-labelledby="catalog-export">
        <ServiceIntro
          icon={FileOutput}
          title="Serviço 2: exportar catálogo"
          description="Use quando não quiser aplicar produtos imediatamente. A exportação usa a mesma origem analisada e gera um arquivo para conferência, backup ou importação manual."
          steps={[
            "Preencha a origem Shopify.",
            "Clique em JSON para dados completos.",
            "Clique em CSV para planilha operacional.",
          ]}
        />

        <Card
          id="routed-create-route"
          className="scroll-mt-6 rounded-lg border-border/60"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-4 w-4 text-primary" />
              Loja e arquivos de saída
            </CardTitle>
            <CardDescription>
              Informe aqui a loja pública que será exportada. Não depende da página de clone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-2">
                <Label htmlFor="export-source">Loja para exportar</Label>
                <Input
                  id="export-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="exemplo.myshopify.com ou dominio.com"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Cole o domínio público da loja. O exportador lê <code>/products.json</code> e monta o arquivo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-limit">Limite</Label>
                <Input
                  id="export-limit"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="numeric"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Quantidade máxima.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">JSON</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Melhor para automações e reimportação completa.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">CSV</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Melhor para revisar preço, SKU e títulos em planilha.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                <p className="text-sm font-medium text-foreground">Origem atual</p>
                <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                  {source || "Nenhuma loja informada"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button variant="outline" onClick={() => handleExport("json")} disabled={Boolean(exportLoading)}>
                {exportLoading === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                Baixar JSON
              </Button>
              <Button variant="outline" onClick={() => handleExport("csv")} disabled={Boolean(exportLoading)}>
                {exportLoading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Baixar CSV
              </Button>
            </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de clone</CardTitle>
            <CardDescription>
              Últimas execuções registradas no Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cloneRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
                Nenhuma execução registrada.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {cloneRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border border-border/60 bg-background/45 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {run.source_domain}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {run.action} · {run.product_count} produtos
                        </p>
                      </div>
                      <Badge variant={run.status === "completed" ? "secondary" : "destructive"} className="rounded-md">
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.createdCount || 0}</span>
                        criados
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.skippedCount || 0}</span>
                        pulados
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.variantMapCount || 0}</span>
                        mapas
                      </div>
                      <div className="rounded-md bg-muted/35 p-2">
                        <span className="block font-semibold">{run.result?.failedCount || 0}</span>
                        falhas
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      )}

      {activeView === "routed-checkout" && (
      <section className="space-y-4" aria-labelledby="routed-checkout">
        <ServiceIntro
          icon={GitBranch}
          title="Serviço 3: routed checkout"
          description="Use quando a vitrine deve vender para o cliente, mas o checkout final precisa ser montado na dark store. O script do tema lê o carrinho da vitrine e troca as variantes antes de enviar o cliente ao checkout."
          steps={[
            "Escolha a loja vitrine e a dark store.",
            "Cole mapas de SKU ou variantes em JSON.",
            "Ative o token gerado no tema da vitrine.",
          ]}
        />

        <RoutedCheckoutTutorial
          installSnippet={installSnippet}
          routeToken={installToken}
        />

        <Card className="rounded-lg border-amber-300/70 bg-amber-50/80">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200/70 text-amber-900">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-amber-950">
                    Antes de testar: desative a password protection da dark store
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    Se a loja destino estiver em “Opening soon” ou protegida por senha,
                    a Shopify redireciona o carrinho roteado para <code>/password</code>.
                    O cliente chega na dark store, mas nao consegue abrir o checkout.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-amber-300/70 bg-white/65 p-3 text-xs leading-5 text-amber-950 lg:w-[360px]">
                <p className="font-semibold">Como evitar o erro</p>
                <p className="mt-1">
                  Na dark store, abra Online Store &gt; Preferences &gt; Password
                  protection e remova a senha. Depois teste em janela anonima:
                  se ainda aparecer “Opening soon”, o roteamento tambem vai parar ali.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="rounded-lg border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="h-4 w-4 text-primary" />
              Criar rota
            </CardTitle>
            <CardDescription>
              Mapeamento SKU/variant para dark store. Use pelo menos um dos mapas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="route-name">Nome</Label>
              <Input
                id="route-name"
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Vitrine</Label>
                <Select value={routeSourceStoreId} onValueChange={handleRouteSourceChange}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Origem">
                      {formatStoreLabel(selectedRouteSourceStore)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        <span className="block max-w-[260px] truncate">
                          {formatStoreLabel(store)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dark store</Label>
                <Select value={routeTargetStoreId} onValueChange={handleRouteTargetChange}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Destino">
                      {formatStoreLabel(selectedRouteTargetStore)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        <span className="block max-w-[260px] truncate">
                          {formatStoreLabel(store)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
              <Label>Modo</Label>
                <Select value={routeMode} onValueChange={(value) => setRouteMode(value || "standard")}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="standard">standard - teste simples</SelectItem>
                    <SelectItem value="enterprise">enterprise - regras futuras</SelectItem>
                    <SelectItem value="enterprise_static">enterprise_static - dark store fixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {stores.length < 2 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm leading-6 text-destructive">
                Conecte pelo menos duas lojas para criar uma rota: uma vitrine e uma dark store.
              </div>
            )}

            <div
              id="routed-create-destination"
              className="scroll-mt-6 rounded-lg border border-border/60 bg-background/45 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Ligacao de produtos reais
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    A tela le as duas lojas pela API da Shopify e mostra exatamente
                    qual produto da vitrine vira qual produto no checkout da dark store.
                    Se a dark store estiver vazia, crie os produtos de destino primeiro.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateDestinationProducts}
                    disabled={
                      destinationCreating ||
                      !routeSourceStoreId ||
                      !routeTargetStoreId ||
                      routeSourceStoreId === routeTargetStoreId ||
                      suggestedRouteMaps.sourceVariants.length === 0
                    }
                  >
                    {destinationCreating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PackageCheck className="h-3.5 w-3.5" />
                    )}
                    Criar destino na dark store
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSkuMap(formatJsonMap(suggestedRouteMaps.skuMap));
                      setVariantMap(formatJsonMap(suggestedRouteMaps.variantMap));
                      setAutofilledMapKey(routeMapKey);
                      toast.success("Mapas reais aplicados nos campos.");
                    }}
                    disabled={suggestedRouteMaps.matches.length === 0}
                  >
                    <WandSparkles className="h-3.5 w-3.5" />
                    Usar mapas reais
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(installSnippet, "script")}
                    disabled={!installToken}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar script
                  </Button>
                </div>
              </div>

              <div
                id="routed-neutralize"
                className="mt-4 scroll-mt-6 rounded-lg border border-primary/25 bg-primary/8 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <WandSparkles className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Neutralizar produto ao criar destino
                      </h3>
                    </div>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                      Quando ativo, o app usa Gemini para remover marcas do título,
                      descrição, SEO e das imagens antes de criar o produto na dark
                      store. Exemplo: “camisa Nike” vira “camisa esportiva”, e logos
                      visíveis são apagados/recriados em uma imagem neutra.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Por segurança de tempo, a neutralização processa até 10 produtos
                      por execução e até 3 imagens por produto.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={neutralizeDestinationProducts ? "default" : "outline"}
                    size="sm"
                    aria-pressed={neutralizeDestinationProducts}
                    onClick={() =>
                      setNeutralizeDestinationProducts((enabled) => !enabled)
                    }
                    className="w-fit shrink-0"
                    disabled={destinationCreating}
                  >
                    <WandSparkles className="h-3.5 w-3.5" />
                    {neutralizeDestinationProducts
                      ? "Neutralização ativa"
                      : "Ativar neutralização"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Vitrine</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {routeProductsLoading ? "..." : suggestedRouteMaps.sourceVariants.length}
                  </p>
                  <p className="text-xs text-muted-foreground">variantes lidas</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Dark store</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {routeProductsLoading ? "..." : suggestedRouteMaps.targetVariants.length}
                  </p>
                  <p className="text-xs text-muted-foreground">variantes lidas</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Correspondências</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {routeProductsLoading ? "..." : suggestedRouteMaps.matches.length}
                  </p>
                  <p className="text-xs text-muted-foreground">por SKU/título</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Sem par</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {routeProductsLoading ? "..." : suggestedRouteMaps.unmatched.length}
                  </p>
                  <p className="text-xs text-muted-foreground">revisar manualmente</p>
                </div>
              </div>

              {routeProductsError ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {routeProductsError}
                </div>
              ) : null}

              {routeLinkRows.length > 0 ? (
                <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-border/60">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Cliente adiciona na vitrine</th>
                        <th className="px-3 py-2 font-medium">Ligacao</th>
                        <th className="px-3 py-2 font-medium">Checkout usa na dark store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routeLinkRows.slice(0, 40).map((row) => (
                        <tr key={row.source.id} className="border-t border-border/50">
                          <td className="max-w-[300px] px-3 py-2">
                            <p className="truncate font-medium text-foreground">
                              {row.source.label}
                            </p>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                              {row.source.id}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={row.target ? "secondary" : "outline"}
                              className="rounded-md"
                            >
                              {row.reason === "manual"
                                ? "manual"
                                : row.reason === "sku"
                                  ? "por SKU"
                                  : row.reason === "titulo"
                                    ? "por titulo"
                                    : "sem destino"}
                            </Badge>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {row.source.sku || "sem SKU"}
                            </p>
                          </td>
                          <td className="max-w-[300px] px-3 py-2">
                            {row.target ? (
                              <>
                                <p className="truncate font-medium text-foreground">
                                  {row.target.label}
                                </p>
                                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                  {row.target.id}
                                </p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                Nenhuma variante de destino escolhida.
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-border/60 bg-card/60 p-3 text-sm leading-6 text-muted-foreground">
                  Ainda nao ha mapa real para copiar. Para gerar automaticamente, a vitrine e a dark store precisam ter variantes equivalentes. Se a dark store estiver vazia, clique em Criar destino na dark store para copiar os produtos da vitrine e gerar os mapas.
                </div>
              )}

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Variantes da vitrine</h3>
                    <Badge variant="outline">{sourceVariantSamples.length} visiveis</Badge>
                  </div>
                  <div className="mt-3 max-h-52 overflow-auto rounded-md border border-border/50">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-card text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium">GID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceVariantSamples.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-muted-foreground" colSpan={3}>
                              Nenhuma variante lida na vitrine.
                            </td>
                          </tr>
                        ) : (
                          sourceVariantSamples.map((variant) => (
                            <tr key={variant.id} className="border-t border-border/50">
                              <td className="max-w-[190px] truncate px-3 py-2 text-foreground">{variant.label}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{variant.sku || "-"}</td>
                              <td className="max-w-[210px] truncate px-3 py-2 font-mono text-muted-foreground">{variant.id}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Variantes da dark store</h3>
                    <Badge variant="outline">{targetVariantSamples.length} visiveis</Badge>
                  </div>
                  <div className="mt-3 max-h-52 overflow-auto rounded-md border border-border/50">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-card text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium">GID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetVariantSamples.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-muted-foreground" colSpan={3}>
                              Nenhuma variante lida na dark store.
                            </td>
                          </tr>
                        ) : (
                          targetVariantSamples.map((variant) => (
                            <tr key={variant.id} className="border-t border-border/50">
                              <td className="max-w-[190px] truncate px-3 py-2 text-foreground">{variant.label}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{variant.sku || "-"}</td>
                              <td className="max-w-[210px] truncate px-3 py-2 font-mono text-muted-foreground">{variant.id}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-primary/25 bg-primary/8 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Ajustar ligacao item por item
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Leia cada linha como “quando o cliente comprar isto na vitrine,
                      envie este item da dark store para o checkout”. Cada escolha
                      atualiza o Variant map automaticamente.
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {Object.keys(currentVariantMap).length} links manuais
                  </Badge>
                </div>

                <div className="mt-4 max-h-[520px] space-y-2 overflow-auto rounded-lg border border-border/60 bg-card/70 p-3">
                  {manualSourceVariants.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                      Nenhuma variante da vitrine carregada ainda.
                    </div>
                  ) : suggestedRouteMaps.targetVariants.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm leading-6 text-muted-foreground">
                      A dark store ainda nao retornou variantes. Cadastre produtos nela
                      ou use Criar destino na dark store para gerar os produtos e depois
                      escolher os destinos.
                    </div>
                  ) : (
                    routeLinkRows.map((row) => (
                      <div
                        key={row.source.id}
                        className="grid gap-3 rounded-lg border border-border/60 bg-background/60 p-3 lg:grid-cols-[minmax(0,1fr)_44px_minmax(320px,1fr)] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="outline" className="rounded-md">
                              Vitrine
                            </Badge>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {row.source.sku || "sem SKU"}
                            </span>
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {row.source.label}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            {row.source.id}
                          </p>
                        </div>

                        <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary lg:flex">
                          <ArrowRight className="h-4 w-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="rounded-md">
                              Dark store
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {row.reason === "manual"
                                ? "definido manualmente"
                                : row.reason === "sku"
                                  ? "sugerido por SKU"
                                  : row.reason === "titulo"
                                    ? "sugerido por titulo"
                                    : "sem destino"}
                            </span>
                          </div>
                          <Select
                            value={currentVariantMap[row.source.id] || row.targetId}
                            onValueChange={(value) =>
                              handleManualVariantLink(row.source.id, value)
                            }
                          >
                            <SelectTrigger className="h-11 w-full min-w-0 bg-background">
                              <SelectValue placeholder="Escolha a variante da dark store" />
                            </SelectTrigger>
                            <SelectContent align="start" className="max-h-80">
                              <SelectItem value="__none__">Sem destino para checkout</SelectItem>
                              {suggestedRouteMaps.targetVariants.map((targetVariant) => (
                                <SelectItem key={targetVariant.id} value={targetVariant.id}>
                                  <span className="block max-w-[560px] truncate">
                                    {targetVariant.label}
                                    {targetVariant.sku ? ` - SKU ${targetVariant.sku}` : ""}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {row.target ? (
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                              {row.target.id}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-destructive">
                              Este produto ainda nao vai para checkout roteado.
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="sku-map">SKU map</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(skuMap, "SKU map")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
                <Textarea
                  id="sku-map"
                  value={skuMap}
                  onChange={(event) => setSkuMap(event.target.value)}
                  rows={7}
                  className="min-h-36 resize-y overflow-auto font-mono text-xs leading-5"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Chave: SKU da vitrine. Valor: variant GID da dark store.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="variant-map">Variant map</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(variantMap, "Variant map")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
                <Textarea
                  id="variant-map"
                  value={variantMap}
                  onChange={(event) => setVariantMap(event.target.value)}
                  rows={7}
                  className="min-h-36 resize-y overflow-auto font-mono text-xs leading-5"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Chave: variant GID da vitrine. Valor: variant GID da dark store.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="leading-6">
                  Depois de criar a rota, copie o token exibido em Rotas ativas
                  para as configurações do tema da vitrine.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCreateRoute}
                disabled={routeSaving || stores.length < 2 || routeSourceStoreId === routeTargetStoreId}
              >
                {routeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                {editingRouteId ? "Salvar alteracoes" : "Criar rota"}
              </Button>
              {editingRouteId ? (
                <Button variant="outline" onClick={resetRouteForm} disabled={routeSaving}>
                  Cancelar edicao
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card
          id="routed-active-routes"
          className="scroll-mt-6 rounded-lg border-border/60"
        >
          <CardHeader>
            <CardTitle className="text-lg">Rotas ativas</CardTitle>
            <CardDescription>
              {configsLoading ? "Carregando" : `${configs.length} configuracoes`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/35 p-6 text-center text-sm text-muted-foreground">
                Nenhuma rota criada.
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="rounded-lg border border-border/60 bg-background/45 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">{config.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {config.mode} · {config.enabled ? "ativo" : "pausado"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatStoreLabel(stores.find((store) => store.id === config.source_store_id))}
                          {" -> "}
                          {formatStoreLabel(stores.find((store) => store.id === config.target_store_id))}
                        </p>
                      </div>
                      <Badge variant={config.enabled ? "secondary" : "outline"} className="rounded-md">
                        {Object.keys(config.sku_map || {}).length + Object.keys(config.variant_map || {}).length} mapas
                      </Badge>
                    </div>
                    <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                      <span className="mr-2 inline-flex items-center gap-1 font-sans text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Token
                      </span>
                      <span className="break-all">{config.public_token}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            `<script
  src="${appOrigin || "https://seu-app.com"}/routed-checkout-loader.js"
  data-token="${config.public_token}"
  async>
</script>`,
                            "script da rota"
                          )
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar código
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadRouteForEditing(config)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRoute(config)}
                        disabled={deletingRouteId === config.id}
                      >
                        {deletingRouteId === config.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </section>
      )}
    </div>
  );
}
