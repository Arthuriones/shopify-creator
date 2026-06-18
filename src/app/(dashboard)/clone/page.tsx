"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Code2,
  Copy,
  Edit3,
  Download,
  FileJson,
  FileOutput,
  GitBranch,
  Image as ImageIcon,
  Languages,
  Loader2,
  PackageCheck,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { getPublicAppUrl } from "@/lib/public-url";
import { CustomPromptDialog } from "@/components/products/CustomPromptDialog";

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
  collectionHandles?: string[];
}

interface TransformedPreviewProduct {
  source: {
    title: string;
    handle: string;
    images: { src: string }[];
  };
  transformed: {
    title: string;
    descriptionHtml: string;
    tags: string[];
    seo?: { title?: string; description?: string };
    images: { src: string; altText?: string | null }[];
    variants: { price?: string; compareAtPrice?: string; options?: string[] }[];
  };
  neutralized: boolean;
  logoAppliedCount: number;
  warnings: string[];
}

interface SourceCollection {
  id: number;
  title: string;
  handle: string;
  image?: string | null;
  productsUrl: string;
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

interface CloneApplyProgress {
  phase: "analyzing" | "importing" | "routing" | "done";
  current: number;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  message: string;
}

type CloneView = "overview" | "shopify" | "export" | "routed-checkout";
type CloneMode = "identical" | "translated" | "routed" | "complete" | "custom";
type InventoryMode = "not_tracked" | "tracked";
type ImportMode = "single" | "bulk";
type RoutedCheckoutView =
  | "create-route"
  | "create-destination"
  | "neutralize"
  | "active-routes"
  | "script";

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

const DEFAULT_CLONE_LIMIT = 250;
const MAX_CLONE_LIMIT = 5000;
const CLONE_BATCH_SIZE = 5;

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

function parseCloneLimit(value: string) {
  const numeric = Number(value || DEFAULT_CLONE_LIMIT);
  if (!Number.isFinite(numeric)) return DEFAULT_CLONE_LIMIT;
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_CLONE_LIMIT);
}

function parseInventoryQuantity(value: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function parseAiMediaLimit(value: string) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.floor(numeric), 1), 20);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function stripPreviewHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function TransformedPreviewCard({
  preview,
}: {
  preview: TransformedPreviewProduct;
}) {
  const firstImage = preview.transformed.images?.[0]?.src;
  const firstPrice = preview.transformed.variants?.[0]?.price;
  const description = stripPreviewHtml(preview.transformed.descriptionHtml || "");

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Visualizacao IA
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            Como este produto vai ficar
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {preview.neutralized && (
            <Badge variant="secondary" className="rounded-md">
              Neutralizado
            </Badge>
          )}
          {preview.logoAppliedCount > 0 && (
            <Badge variant="secondary" className="rounded-md">
              Logo aplicada
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="h-24 w-24 overflow-hidden rounded-lg border border-border/60 bg-background/70">
          {firstImage ? (
            <img src={firstImage} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Original</p>
          <p className="truncate text-xs text-muted-foreground">
            {preview.source.title}
          </p>
          <p className="mt-2 text-sm font-semibold leading-5 text-foreground">
            {preview.transformed.title}
          </p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {description || "Sem descricao gerada."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{preview.transformed.images.length} midia(s)</span>
            <span>{preview.transformed.variants.length} variante(s)</span>
            {firstPrice ? <span>Preco: {firstPrice}</span> : null}
          </div>
        </div>
      </div>

      {preview.transformed.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {preview.transformed.tags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-md text-[11px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-amber-500">
          {preview.warnings.length} aviso(s) na transformacao. A importacao em massa
          ainda pode continuar usando as midias originais quando a IA falhar.
        </p>
      )}
    </div>
  );
}

function cloneSourceKey(sourceValue: string, limitValue: number) {
  return `${sourceValue.trim().toLowerCase()}::${limitValue}`;
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
    <div className="rounded-lg border border-border/60 bg-card/70 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
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
        <ol className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {steps.map((step, index) => (
          <li
            key={step}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border/50 bg-background/45 px-3 py-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </span>
              <span className="leading-5">{step}</span>
          </li>
        ))}
      </ol>
      </div>
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

function RoutedTaskHeader({
  routedView,
  hasRoutes,
  routesCount,
}: {
  routedView: RoutedCheckoutView;
  hasRoutes: boolean;
  routesCount: number;
}) {
  const content = {
    "create-destination": {
      eyebrow: "Etapa 1",
      title: "Criar produtos na dark store",
      description:
        "Use quando a dark store ainda não tem os produtos equivalentes. O app copia os produtos da vitrine, pode traduzir/neutralizar e já prepara os mapas.",
      checklist: [
        "Escolha vitrine e dark store",
        "Marque tradução ou neutralização se precisar",
        "Clique em Criar destino",
      ],
    },
    "create-route": {
      eyebrow: "Etapa 2",
      title: "Vincular produto da vitrine ao produto da dark store",
      description:
        "Aqui você confere qual variante da vitrine vira qual variante da dark store. Se os produtos já batem por SKU ou título, use os mapas reais.",
      checklist: [
        "Escolha as duas lojas",
        "Revise as correspondências",
        "Crie a rota e copie o token",
      ],
    },
    script: {
      eyebrow: "Etapa 3",
      title: "Instalar o script na vitrine",
      description:
        "Depois que a rota existe, cole o loader no tema da loja vitrine. O token no script é o que liga a vitrine à rota salva.",
      checklist: [
        "Copie o código pronto",
        "Cole antes de </body>",
        "Teste em janela anônima",
      ],
    },
    "active-routes": {
      eyebrow: "Gestão",
      title: "Rotas, tokens e manutenção",
      description:
        "Edite, exclua ou copie tokens das rotas já criadas. Se o checkout não rotear, confira primeiro se o token instalado no tema está nesta lista.",
      checklist: [
        "Confira o token ativo",
        "Edite mapas se necessário",
        "Copie o script atualizado",
      ],
    },
    neutralize: {
      eyebrow: "IA opcional",
      title: "Neutralizar produtos antes de criar destino",
      description:
        "Use para criar uma versao stock/unbranded, removendo marcas do proprio produto e tambem artefatos externos.",
      checklist: [
        "Escolha as lojas",
        "Ative neutralização",
        "Crie destino na dark store",
      ],
    },
  }[routedView];

  const mainSteps = [
    { view: "create-destination", href: "/clone/routed-checkout/create-destination", label: "Criar destino" },
    { view: "create-route", href: "/clone/routed-checkout/create-route", label: "Vincular produtos" },
    { view: "script", href: "/clone/routed-checkout/script", label: "Instalar script" },
  ];

  // Passo "ativo" entre os principais. Neutralização faz parte do passo 1.
  const activeMainView = routedView === "neutralize" ? "create-destination" : routedView;
  const isManaging = routedView === "active-routes";

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-1.5">
        {mainSteps.map((step, index) => {
          const active = !isManaging && step.view === activeMainView;
          // Passos 1 e 2 ficam "feitos" quando já existe ao menos uma rota.
          const done = !active && hasRoutes && index < 2;
          return (
            <div key={step.view} className="flex items-center gap-1.5">
              {index > 0 && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              )}
              <Link
                href={step.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-primary/50 bg-primary/12 text-foreground"
                    : done
                      ? "border-primary/25 bg-primary/5 text-foreground"
                      : "border-border/60 bg-background/45 text-muted-foreground hover:text-foreground"
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/70 text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                {step.label}
              </Link>
            </div>
          );
        })}

        <span className="mx-1 hidden h-5 w-px bg-border/60 sm:block" />

        <Link
          href="/clone/routed-checkout/active-routes"
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors",
            isManaging
              ? "border-primary/50 bg-primary/12 text-foreground"
              : "border-border/60 bg-background/45 text-muted-foreground hover:text-foreground"
          )}
        >
          Rotas ativas
          {routesCount > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {routesCount}
            </Badge>
          )}
        </Link>
      </div>

      {/* Sub-opção do passo 1 */}
      <div className="mt-2">
        <Link
          href="/clone/routed-checkout/neutralize"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            routedView === "neutralize"
              ? "bg-primary/12 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Opcional: Neutralização IA (dentro do passo 1)
        </Link>
      </div>

      {/* Contexto do passo atual */}
      <div className="mt-3 border-t border-border/60 pt-3">
        <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
          {content.title}
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
          {content.description}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {content.checklist.map((item, index) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/45 px-2 py-1 text-xs text-muted-foreground"
            >
              <span className="font-semibold text-primary">{index + 1}</span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
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
      title: "Loja vitrine",
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
      <Card
        id="routed-script"
        className="scroll-mt-6 rounded-lg border-primary/30 bg-primary/8"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Code2 className="h-5 w-5 text-primary" />
            Código pronto para colar na vitrine
          </CardTitle>
          <CardDescription>
            Instale este loader na loja que o cliente visita. Não use o arquivo de referência <code>cartoriginals.web.app</code>, porque ele aponta para outro app.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            <CodeBlock>{installSnippet}</CodeBlock>
            <div className="rounded-lg border border-border/60 bg-card/80 p-3 text-sm leading-6 text-muted-foreground">
              Cole imediatamente antes de <code>&lt;/body&gt;</code> no arquivo
              <code> layout/theme.liquid</code>. Se seu editor não mostrar esse
              arquivo, pesquise por <code>&lt;/body&gt;</code> ou por
              <code> theme.liquid</code> no painel de código do tema.
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Passos exatos</p>
            <ol className="space-y-2">
              {installSteps.slice(0, 3).map((step, index) => (
                <li key={step.title} className="rounded-lg border border-border/60 bg-card/80 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-xs text-primary">
                      {index + 1}
                    </span>
                    {step.title}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
            <p className="text-xs leading-5 text-muted-foreground">
              Token usado agora: {routeToken || "crie ou selecione uma rota para gerar o token real"}.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {plainMeaning.map((item) => (
          <div key={item.title} className="rounded-lg border border-border/60 bg-card p-4">
            <p className="font-heading text-base font-bold text-foreground">
              {item.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.detail}
            </p>
          </div>
        ))}
      </div>

      <details className="rounded-lg border border-border/60 bg-card p-4">
        <summary className="cursor-pointer text-base font-bold text-foreground">
          Entender token, SKU e GID
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tokenGuide.map((item) => (
            <div key={item.title} className="rounded-lg border border-border/60 bg-background/45 p-4">
              <p className="text-sm font-bold text-foreground">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
          {mapTerms.map((item) => (
            <div key={item.title} className="rounded-lg border border-border/60 bg-background/45 p-4">
              <p className="text-sm font-bold text-foreground">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-lg border border-border/60 bg-card p-4">
        <summary className="cursor-pointer text-base font-bold text-foreground">
          Como o pedido muda de loja
        </summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ol className="space-y-2">
            {flow.map((item, index) => (
              <li key={item} className="flex gap-3 rounded-lg border border-border/60 bg-background/45 p-3 text-sm text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="leading-6">{item}</span>
              </li>
            ))}
          </ol>

          <div className="space-y-2">
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
        </div>
      </details>

      <Card className="rounded-lg border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">Checklist de teste</CardTitle>
          <CardDescription>
            Use depois de salvar o tema da vitrine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{`1. Remova a password protection da dark store
2. Salve o theme.liquid da vitrine
3. Abra a vitrine em janela anonima
4. Adicione um produto que aparece na rota
5. Clique em checkout
6. Confirme se a URL final é da dark store`}</CodeBlock>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClonePage() {
  const pathname = usePathname();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState(String(DEFAULT_CLONE_LIMIT));
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("not_tracked");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [cloneMode, setCloneMode] = useState<CloneMode>("identical");
  const [publishToStorefront, setPublishToStorefront] = useState(true);
  const [translateCloneProducts, setTranslateCloneProducts] = useState(false);
  const [translateVariantOptions, setTranslateVariantOptions] = useState(false);
  const [neutralizeCloneProducts, setNeutralizeCloneProducts] = useState(false);
  const [
    removeExternalReferencesCloneProducts,
    setRemoveExternalReferencesCloneProducts,
  ] = useState(false);
  const [cloneAiMediaLimit, setCloneAiMediaLimit] = useState("1");
  const [cloneGenericizeText, setCloneGenericizeText] = useState(true);
  const [cloneNeutralizationInstructions, setCloneNeutralizationInstructions] =
    useState("");
  const [cloneCustomPrompt, setCloneCustomPrompt] = useState("");
  const [applyLogoToCloneImages, setApplyLogoToCloneImages] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [createRoutingConfig, setCreateRoutingConfig] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [transformPreviewLoading, setTransformPreviewLoading] = useState(false);
  const [transformedPreview, setTransformedPreview] =
    useState<TransformedPreviewProduct | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"json" | "csv" | null>(null);
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [sourceDomain, setSourceDomain] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const [applyProgress, setApplyProgress] = useState<CloneApplyProgress | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("bulk");
  const [selectedImportMode, setSelectedImportMode] = useState<ImportMode | null>(null);
  const [sourceCollections, setSourceCollections] = useState<SourceCollection[]>([]);
  const [selectedProductHandles, setSelectedProductHandles] = useState<string[]>([]);

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
  const [invertingRouteId, setInvertingRouteId] = useState("");
  const [destinationCreating, setDestinationCreating] = useState(false);
  const [translateDestinationProducts, setTranslateDestinationProducts] =
    useState(false);
  const [translateDestinationVariantOptions, setTranslateDestinationVariantOptions] =
    useState(false);
  const [neutralizeDestinationProducts, setNeutralizeDestinationProducts] =
    useState(false);
  const [destinationAiMediaLimit, setDestinationAiMediaLimit] = useState("1");
  const [destinationGenericizeText, setDestinationGenericizeText] = useState(true);
  const [
    destinationNeutralizationInstructions,
    setDestinationNeutralizationInstructions,
  ] = useState("");
  const [sourceProducts, setSourceProducts] = useState<ConnectedProduct[]>([]);
  const [targetProducts, setTargetProducts] = useState<ConnectedProduct[]>([]);
  const [routeProductsLoading, setRouteProductsLoading] = useState(false);
  const [routeProductsError, setRouteProductsError] = useState("");
  const [routeProductsRefreshKey, setRouteProductsRefreshKey] = useState(0);
  const [appOrigin, setAppOrigin] = useState(getPublicAppUrl());
  const [autofilledMapKey, setAutofilledMapKey] = useState("");

  const cloneAbortRef = useRef<AbortController | null>(null);
  const destinationAbortRef = useRef<AbortController | null>(null);

  const activeView: CloneView = pathname === "/clone/shopify" || pathname.startsWith("/clone/shopify/")
    ? "shopify"
    : pathname.endsWith("/export")
      ? "export"
      : pathname === "/clone/routed-checkout" || pathname.startsWith("/clone/routed-checkout/")
        ? "routed-checkout"
        : "overview";

  const routedView: RoutedCheckoutView = pathname.endsWith("/create-destination")
    ? "create-destination"
    : pathname.endsWith("/neutralize")
      ? "neutralize"
      : pathname.endsWith("/active-routes")
        ? "active-routes"
        : pathname.endsWith("/script")
          ? "script"
          : "create-route";

  const showRoutedSetup =
    routedView === "create-route" ||
    routedView === "create-destination" ||
    routedView === "neutralize";
  const routedImportMode: ImportMode | null = pathname.endsWith("/individual")
    ? "single"
    : pathname.endsWith("/bulk")
      ? "bulk"
      : null;
  const isCloneConfigSubpage = pathname.endsWith("/configuracao");
  const isImportSubpage = Boolean(routedImportMode);

  const pageMeta = {
    overview: {
      title: "Central de clone e checkout",
      description:
        "Escolha um recurso independente: clonar produtos, exportar catálogo ou configurar a Loja vitrine.",
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
      title: "Loja vitrine",
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

  // Para o passo "Instalar script": usa a rota que casa com as lojas selecionadas;
  // se nenhuma casar, cai para a primeira rota ativa, garantindo um token real.
  const scriptConfig =
    selectedRouteConfig || configs.find((config) => config.enabled) || configs[0] || null;
  const installToken = scriptConfig?.public_token || "";
  function buildRoutedInstallSnippet(token: string) {
    return `<script
  src="${appOrigin}/routed-checkout-loader.js"
  data-token="${token}"
  async>
</script>`;
  }

  const installSnippet = buildRoutedInstallSnippet(
    installToken || "COLE_O_TOKEN_DA_ROTA"
  );

  useEffect(() => {
    setAppOrigin(getPublicAppUrl(window.location.origin));
  }, []);

  useEffect(() => {
    if (!routedImportMode) return;
    setImportMode(routedImportMode);
    setSelectedImportMode(routedImportMode);
  }, [routedImportMode]);

  useEffect(() => {
    if (!isCloneConfigSubpage) return;
    setImportMode("bulk");
    setSelectedImportMode("bulk");
  }, [isCloneConfigSubpage]);

  function openInlineImport(mode: ImportMode) {
    setImportMode(mode);
    setSelectedImportMode(mode);
  }

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

  function handleCloneModeChange(value: string | null) {
    const mode = (value || "identical") as CloneMode;
    setCloneMode(mode);

    if (mode === "identical") {
      setPublishToStorefront(true);
      setTranslateCloneProducts(false);
      setTranslateVariantOptions(false);
      setCreateRoutingConfig(false);
      setDuplicatePolicy("skip");
      return;
    }

    if (mode === "translated") {
      setPublishToStorefront(true);
      setTranslateCloneProducts(true);
      setTranslateVariantOptions(true);
      setCreateRoutingConfig(false);
      setDuplicatePolicy("skip");
      return;
    }

    if (mode === "routed") {
      setPublishToStorefront(true);
      setTranslateCloneProducts(false);
      setTranslateVariantOptions(false);
      setCreateRoutingConfig(true);
      setDuplicatePolicy("skip");
      return;
    }

    if (mode === "complete") {
      setPublishToStorefront(true);
      setTranslateCloneProducts(true);
      setTranslateVariantOptions(true);
      setCreateRoutingConfig(true);
      setDuplicatePolicy("skip");
    }
  }

  async function runClone(
    action: "preview" | "export-json" | "export-csv" | "apply",
    signal?: AbortSignal,
    overrides?: Record<string, unknown>
  ) {
    const payload = {
      source,
      action,
      importMode,
      sourceStoreId,
      targetStoreId,
      limit: parseCloneLimit(limit),
      inventoryMode,
      inventoryQuantity: parseInventoryQuantity(inventoryQuantity),
      publishToStorefront,
      translateProducts: translateCloneProducts,
      translateVariantOptions,
      neutralizeProducts: neutralizeCloneProducts,
      removeExternalReferences: removeExternalReferencesCloneProducts,
      aiMediaLimit: parseAiMediaLimit(cloneAiMediaLimit),
      genericizeText: cloneGenericizeText,
      neutralizationInstructions: cloneNeutralizationInstructions,
      customPrompt: cloneCustomPrompt,
      applyLogoToImages: applyLogoToCloneImages,
      duplicatePolicy,
      createRoutingConfig,
      ...overrides,
    };

    const res = await fetch("/api/shopify/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
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
    setTransformedPreview(null);
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const data = await runClone("preview", controller.signal);
      const loadedProducts = (data.products || []) as PreviewProduct[];
      setPreview(loadedProducts);
      setSourceDomain(data.sourceDomain || "");
      setSourceCollections((data.collections || []) as SourceCollection[]);
      setSelectedProductHandles(loadedProducts.map((product) => product.handle));
      setPreviewKey(cloneSourceKey(source, parseCloneLimit(limit)));
      toast.success(`${data.count || 0} produtos encontrados.`);
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(error instanceof Error ? error.message : "Falha ao analisar loja.");
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setPreviewLoading(false);
    }
  }

  async function handleTransformPreview() {
    if (!source.trim()) {
      toast.error("Informe a loja de origem.");
      return;
    }
    if (!targetStoreId) {
      toast.error("Selecione a loja de destino para visualizar.");
      return;
    }

    setTransformPreviewLoading(true);
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const selectedHandle =
        importMode === "bulk" && selectedProductHandles.length > 0
          ? selectedProductHandles[0]
          : undefined;
      const data = await runClone("preview", controller.signal, {
        transformPreview: true,
        recordRun: false,
        limit: 1,
        pageSize: 1,
        ...(selectedHandle ? { productHandles: [selectedHandle] } : {}),
      });
      const loadedProducts = (data.products || []) as PreviewProduct[];
      if (loadedProducts.length > 0) {
        setPreview((current) => (current.length > 0 ? current : loadedProducts));
        setSelectedProductHandles((current) =>
          current.length > 0
            ? current
            : loadedProducts.map((product) => product.handle)
        );
      }
      setSourceDomain(data.sourceDomain || "");
      setSourceCollections((data.collections || []) as SourceCollection[]);
      setTransformedPreview(
        (data.transformedPreview || null) as TransformedPreviewProduct | null
      );
      toast.success("Previa transformada gerada.");
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Falha ao gerar previa transformada."
        );
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setTransformPreviewLoading(false);
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
    setApplyProgress({
      phase: "analyzing",
      current: 0,
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      message: "Lendo produtos da origem antes de importar...",
    });
    const controller = new AbortController();
    cloneAbortRef.current = controller;
    try {
      const requestedLimit = parseCloneLimit(limit);
      const currentPreviewKey = cloneSourceKey(source, requestedLimit);
      let total =
        importMode === "single"
          ? 1
          : previewKey === currentPreviewKey
            ? preview.length
            : 0;
      let resolvedSourceDomain = sourceDomain;
      let previewForRun = previewKey === currentPreviewKey ? preview : [];
      let sourceCollectionsForRun = sourceCollections;
      let selectedHandlesForRun =
        importMode === "bulk" && previewKey === currentPreviewKey
          ? selectedProductHandles
          : [];

      if (
        (importMode === "bulk" && total === 0) ||
        (importMode === "single" && previewKey !== currentPreviewKey)
      ) {
        const previewData = await runClone("preview", controller.signal, {
          limit: requestedLimit,
          recordRun: false,
        });
        const loadedProducts = previewData.products || [];
        total = importMode === "single" ? 1 : loadedProducts.length;
        resolvedSourceDomain = previewData.sourceDomain || "";
        previewForRun = loadedProducts;
        sourceCollectionsForRun = (previewData.collections || []) as SourceCollection[];
        setPreview(loadedProducts);
        setSourceDomain(resolvedSourceDomain);
        setSourceCollections(sourceCollectionsForRun);
        selectedHandlesForRun = loadedProducts.map(
          (product: PreviewProduct) => product.handle
        );
        setSelectedProductHandles(selectedHandlesForRun);
        setPreviewKey(currentPreviewKey);
      }

      if (total === 0) {
        toast.error("Nenhum produto encontrado para importar.");
        return;
      }

      const aggregate = {
        attempted: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        neutralizedCount: 0,
        logoAppliedCount: 0,
        skuMap: {} as Record<string, string>,
        variantMap: {} as Record<string, string>,
      };

      const activeSelectedHandles =
        importMode === "bulk" && selectedHandlesForRun.length > 0
          ? selectedHandlesForRun
          : [];
      if (activeSelectedHandles.length > 0) {
        total = activeSelectedHandles.length;
      }
      const totalPages = Math.ceil(total / CLONE_BATCH_SIZE);
      for (let page = 1; page <= totalPages; page += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Operacao cancelada.", "AbortError");
        }

        const batchStart = (page - 1) * CLONE_BATCH_SIZE + 1;
        const batchEnd = Math.min(page * CLONE_BATCH_SIZE, total);
        setApplyProgress({
          phase: "importing",
          current: batchStart - 1,
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: `Importando produtos ${batchStart}-${batchEnd}/${total}...`,
        });

        const handleBatch = activeSelectedHandles.slice(
          (page - 1) * CLONE_BATCH_SIZE,
          page * CLONE_BATCH_SIZE
        );
        const productCollectionBatch = Object.fromEntries(
          previewForRun
            .filter((product) =>
              handleBatch.length > 0
                ? handleBatch.includes(product.handle)
                : product.collectionHandles?.length
            )
            .map((product) => [product.handle, product.collectionHandles || []])
        );
        const data = await runClone("apply", controller.signal, {
          importMode,
          ...(handleBatch.length > 0
            ? { productHandles: handleBatch, limit: handleBatch.length }
            : {
                page,
                pageSize: CLONE_BATCH_SIZE,
                limit: CLONE_BATCH_SIZE,
              }),
          collections: sourceCollectionsForRun.map((collection) => ({
            handle: collection.handle,
            title: collection.title,
          })),
          productCollections: productCollectionBatch,
          createRoutingConfig: false,
          recordRun: false,
        });

        const attempted = Number(data.attempted || 0);
        if (attempted === 0) break;

        aggregate.attempted += attempted;
        aggregate.createdCount += Number(data.createdCount || 0);
        aggregate.skippedCount += Number(data.skippedCount || 0);
        aggregate.failedCount += Number(data.failedCount || 0);
        aggregate.neutralizedCount += Number(data.neutralizedCount || 0);
        aggregate.logoAppliedCount += Number(data.logoAppliedCount || 0);
        Object.assign(aggregate.skuMap, data.skuMap || {});
        Object.assign(aggregate.variantMap, data.variantMap || {});

        setApplyProgress({
          phase: "importing",
          current: Math.min(aggregate.attempted, total),
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: `Importando produto ${Math.min(aggregate.attempted, total)}/${total}...`,
        });
      }

      let routingConfig: unknown = null;
      if (createRoutingConfig && sourceStoreId && targetStoreId) {
        setApplyProgress({
          phase: "routing",
          current: Math.min(aggregate.attempted, total),
          total,
          created: aggregate.createdCount,
          skipped: aggregate.skippedCount,
          failed: aggregate.failedCount,
          message: "Criando rota única com os mapas importados...",
        });

        const routeRes = await fetch("/api/checkout-routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name: `Clone ${resolvedSourceDomain || source} -> ${selectedTarget?.shop_domain || "destino"}`,
            sourceStoreId,
            targetStoreId,
            mode: "enterprise_static",
            skuMap: aggregate.skuMap,
            variantMap: aggregate.variantMap,
            settings: { generatedBy: "shopify_clone_batched" },
          }),
        });
        const routeData = await routeRes.json().catch(() => ({}));
        if (!routeRes.ok) {
          throw new Error(routeData.error || "Produtos criados, mas falhou ao criar rota.");
        }
        routingConfig = routeData.config;
      }

      setApplyProgress({
        phase: "done",
        current: Math.min(aggregate.attempted, total),
        total,
        created: aggregate.createdCount,
        skipped: aggregate.skippedCount,
        failed: aggregate.failedCount,
        message: "Importação concluída.",
      });
      toast.success(
        `${aggregate.createdCount} criados, ${aggregate.skippedCount} pulados e ${aggregate.failedCount} falharam de ${aggregate.attempted} produto(s).`
      );
      if (aggregate.failedCount) {
        toast.error(`${aggregate.failedCount} produtos falharam.`);
      }
      if (routingConfig) {
        toast.success("Rota de checkout criada com os mapas completos.");
      }
      if (aggregate.neutralizedCount) {
        toast.success(`${aggregate.neutralizedCount} produto(s) neutralizados com IA.`);
      }
      if (aggregate.logoAppliedCount) {
        toast.success(`${aggregate.logoAppliedCount} imagem(ns) receberam a logo.`);
      }
      await Promise.all([loadConfigs(), loadCloneRuns()]);
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(error instanceof Error ? error.message : "Falha ao aplicar clone.");
      }
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null;
      setApplyLoading(false);
    }
  }

  function toggleProductHandle(handle: string, checked: boolean) {
    setSelectedProductHandles((current) => {
      if (checked) return [...new Set([...current, handle])];
      return current.filter((item) => item !== handle);
    });
  }

  function toggleAllProducts(checked: boolean) {
    setSelectedProductHandles(checked ? preview.map((product) => product.handle) : []);
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

  async function handleInvertRoute(config: CheckoutConfig) {
    const entries = Object.entries(config.variant_map || {});
    if (entries.length === 0) {
      toast.error("Esta rota nao tem mapa para inverter. Recrie a rota.");
      return;
    }
    const values = entries.map(([, value]) => value);
    if (new Set(values).size !== values.length) {
      toast.error(
        "Nao da para inverter automaticamente (destinos repetidos no mapa). Recrie a rota com a vitrine correta."
      );
      return;
    }

    const confirmed = window.confirm(
      `Inverter "${config.name}"?\n\nA vitrine (onde o cliente compra) e a dark store (onde fica o checkout) serao trocadas. O token instalado no tema continua o mesmo.`
    );
    if (!confirmed) return;

    setInvertingRouteId(config.id);
    try {
      const invertedVariantMap = Object.fromEntries(
        entries.map(([key, value]) => [value, key])
      );
      const res = await fetch("/api/checkout-routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: config.id,
          name: config.name,
          sourceStoreId: config.target_store_id,
          targetStoreId: config.source_store_id,
          mode: config.mode,
          variantMap: invertedVariantMap,
          // sku_map nao pode ser invertido de forma confiavel; o variant_map
          // ja cobre o roteamento. Recriar destino refaz o sku_map se preciso.
          skuMap: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao inverter rota.");
      toast.success("Vitrine e dark store invertidas. O token segue o mesmo.");
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao inverter rota.");
    } finally {
      setInvertingRouteId("");
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
    const controller = new AbortController();
    destinationAbortRef.current = controller;
    try {
      const res = await fetch("/api/checkout-routes/create-destination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sourceStoreId: routeSourceStoreId,
          targetStoreId: routeTargetStoreId,
          limit: 50,
          inventoryMode,
          inventoryQuantity: parseInventoryQuantity(inventoryQuantity),
          neutralizeProducts: neutralizeDestinationProducts,
          aiMediaLimit: parseAiMediaLimit(destinationAiMediaLimit),
          genericizeText: destinationGenericizeText,
          neutralizationInstructions: destinationNeutralizationInstructions,
          translateProducts: translateDestinationProducts,
          translateVariantOptions: translateDestinationVariantOptions,
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
      if (data.translatedCount) {
        toast.success(`${data.translatedCount} produto(s) traduzidos com IA.`);
      }
      if (data.failedCount) {
        toast.error(`${data.failedCount} produto(s) falharam ao criar destino.`);
      }
    } catch (error) {
      if (isAbortError(error)) {
        toast("Operacao cancelada.");
      } else {
        toast.error(error instanceof Error ? error.message : "Falha ao criar destino.");
      }
    } finally {
      if (destinationAbortRef.current === controller) destinationAbortRef.current = null;
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

    let parsedSkuMap: Record<string, string>;
    let parsedVariantMap: Record<string, string>;
    try {
      parsedSkuMap = parseJsonMap(skuMap, "SKU map");
      parsedVariantMap = parseJsonMap(variantMap, "Variant map");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mapa invalido.");
      return;
    }

    // Sem mapa de variantes a rota nao consegue rotear nada no checkout
    // (cai no checkout da vitrine). Bloqueia e orienta a conectar antes.
    if (
      Object.keys(parsedVariantMap).length === 0 &&
      Object.keys(parsedSkuMap).length === 0
    ) {
      toast.error(
        "Nenhuma variante conectada. Rode \"Criar destino\" (passo 1) para conectar os produtos por SKU antes de salvar a rota."
      );
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
          skuMap: parsedSkuMap,
          variantMap: parsedVariantMap,
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
    <div className="space-y-5 animate-fade-in">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {pageMeta.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {pageMeta.description}
        </p>
      </header>

      {activeView === "overview" && <ServiceOverview />}

      {activeView === "shopify" && (
      <section className="space-y-4" aria-labelledby="clone-shopify">
        {!isCloneConfigSubpage && (
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
        )}

        {!isImportSubpage && !isCloneConfigSubpage && (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => openInlineImport("single")}
            className="group rounded-lg border border-primary/35 bg-primary/10 p-4 text-left shadow-sm transition-colors hover:border-primary/65 hover:bg-primary/15"
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">
              <PackageCheck className="h-4 w-4" />
              Importar individual
            </span>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Importar produto individual
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Use uma URL de produto Shopify específica, configure destino e publique só aquele item.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={() => openInlineImport("bulk")}
            className="group rounded-lg border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/55 hover:bg-card/80"
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-sm font-bold text-foreground">
              <Download className="h-4 w-4 text-primary" />
              Importar em massa
            </span>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Importar em massa
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Leia a loja, selecione produtos, veja coleções encontradas e importe em lotes com progresso.
            </p>
            <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </button>
        </div>
        )}

        {(selectedImportMode || isImportSubpage) && (
          <Card className="rounded-lg border-border/60">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>
                    {isCloneConfigSubpage
                      ? "Configurações de clone"
                      : importMode === "single"
                        ? "Importar produto individual"
                        : "Selecionar produtos para importar"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {isCloneConfigSubpage
                      ? "Ajuste origem, destino, publicação, estoque, IA e seleção antes de importar na Shopify."
                      : "Configure origem, destino, publicação, estoque e seleção antes de gravar na Shopify."}
                  </CardDescription>
                </div>
                {!isImportSubpage && !isCloneConfigSubpage && (
                  <div className="inline-flex rounded-md border border-border bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => openInlineImport("single")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                        importMode === "single"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => openInlineImport("bulk")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                        importMode === "bulk"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Em massa
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="modal-source">
                      {importMode === "single" ? "URL do produto" : "Loja de origem"}
                    </Label>
                    <Input
                      id="modal-source"
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder={
                        importMode === "single"
                          ? "https://loja.com/products/produto"
                          : "exemplo.myshopify.com ou dominio.com"
                      }
                    />
                  </div>
                  {importMode === "bulk" && (
                    <div className="space-y-2">
                      <Label htmlFor="modal-limit">Limite</Label>
                      <Input
                        id="modal-limit"
                        value={limit}
                        onChange={(event) => setLimit(event.target.value)}
                        inputMode="numeric"
                        min={1}
                        max={MAX_CLONE_LIMIT}
                        type="number"
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
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
                            {formatStoreLabel(store)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={publishToStorefront}
                      onChange={(event) => setPublishToStorefront(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Publicar produto</span>
                      <span className="text-xs text-muted-foreground">Online Store ao importar.</span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={translateCloneProducts}
                      onChange={(event) => setTranslateCloneProducts(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Traduzir produto</span>
                      <span className="text-xs text-muted-foreground">Usa idioma da loja destino.</span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={translateVariantOptions}
                      onChange={(event) => setTranslateVariantOptions(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Traduzir variações</span>
                      <span className="text-xs text-muted-foreground">
                        blue {"->"} azul, S/small {"->"} P.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-[132px] min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={neutralizeCloneProducts}
                      onChange={(event) => {
                        setNeutralizeCloneProducts(event.target.checked);
                        if (event.target.checked) {
                          setRemoveExternalReferencesCloneProducts(false);
                        }
                        setCloneMode("custom");
                      }}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <WandSparkles className="h-3.5 w-3.5 text-primary" />
                        Neutralizar produto (stock)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Remove marcas inclusive quando fazem parte do produto.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={removeExternalReferencesCloneProducts}
                      onChange={(event) => {
                        setRemoveExternalReferencesCloneProducts(event.target.checked);
                        if (event.target.checked) {
                          setNeutralizeCloneProducts(false);
                        }
                        setCloneMode("custom");
                      }}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <WandSparkles className="h-3.5 w-3.5 text-primary" />
                        Retirar referencias externas
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Mantem marcas reais do produto e limpa origem/vendedor.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={applyLogoToCloneImages}
                      onChange={(event) => setApplyLogoToCloneImages(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <ImageIcon className="h-3.5 w-3.5 text-primary" />
                        Aplicar logo
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Marca as imagens em massa.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-14 items-start gap-2 rounded-lg border border-border/60 bg-background/45 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={createRoutingConfig}
                      onChange={(event) => setCreateRoutingConfig(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Preparar rota</span>
                      <span className="text-xs text-muted-foreground">Gera mapa para Loja vitrine.</span>
                    </span>
                  </label>
                </div>

                {(neutralizeCloneProducts || removeExternalReferencesCloneProducts) && (
                  <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="clone-ai-media-limit">
                          Midias com IA por produto
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Controle o custo: a IA processa so as primeiras midias; as outras seguem originais.
                        </p>
                      </div>
                      {neutralizeCloneProducts && (
                        <label className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/8 p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={cloneGenericizeText}
                            onChange={(event) => {
                              setCloneGenericizeText(event.target.checked);
                              setCloneMode("custom");
                            }}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="block font-medium text-foreground">
                              Genericizar nome, descricao e SEO
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Ex.: Air Jordan shoes vira Tenis esportivo casual.
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                    <Input
                      id="clone-ai-media-limit"
                      type="number"
                      min={1}
                      max={20}
                      value={cloneAiMediaLimit}
                      onChange={(event) => {
                        setCloneAiMediaLimit(event.target.value);
                        setCloneMode("custom");
                      }}
                      className="h-10 bg-background/70"
                    />
                  </div>
                )}

                {neutralizeCloneProducts && (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/8 p-3">
                    <Label htmlFor="clone-neutralization-instructions">
                      Instruções extras para neutralização
                    </Label>
                    <Textarea
                      id="clone-neutralization-instructions"
                      rows={3}
                      value={cloneNeutralizationInstructions}
                      onChange={(event) => {
                        setCloneNeutralizationInstructions(event.target.value);
                        setCloneMode("custom");
                      }}
                      placeholder="Ex.: remover apenas o patch FIFA, manter o escudo AFA e preservar o padrão azul da camisa."
                      className="bg-background/70 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Vale para os produtos selecionados nesta importação.
                    </p>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-border/60 bg-background/45 p-3">
                  <CustomPromptDialog
                    value={cloneCustomPrompt}
                    onChange={(nextPrompt) => {
                      setCloneCustomPrompt(nextPrompt);
                      setCloneMode("custom");
                    }}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vale para os produtos selecionados nesta importacao.
                  </p>
                </div>

                <div className="grid gap-3 rounded-lg border border-border/60 bg-background/45 p-3 md:grid-cols-[1fr_160px]">
                  <div className="space-y-2">
                    <Label>Estoque</Label>
                    <Select
                      value={inventoryMode}
                      onValueChange={(value) => setInventoryMode((value || "not_tracked") as InventoryMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="not_tracked">Inventory not tracked</SelectItem>
                        <SelectItem value="tracked">Definir estoque inicial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      value={inventoryQuantity}
                      onChange={(event) => setInventoryQuantity(event.target.value)}
                      type="number"
                      min={0}
                      disabled={inventoryMode === "not_tracked"}
                    />
                  </div>
                </div>

                {importMode === "bulk" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Produtos da origem
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {preview.length
                            ? `Mostrando ${preview.length}/${parseCloneLimit(limit)} carregados`
                            : "Clique em analisar para carregar a lista."}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={preview.length > 0 && selectedProductHandles.length === preview.length}
                          onChange={(event) => toggleAllProducts(event.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                        Selecionar todos
                      </label>
                    </div>
                    <div className="max-h-80 overflow-auto rounded-lg border border-border/60">
                      {preview.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                          Nenhum produto carregado ainda.
                        </div>
                      ) : (
                        preview.map((product) => (
                          <label
                            key={product.handle}
                            className="grid cursor-pointer grid-cols-[24px_56px_minmax(0,1fr)] gap-3 border-b border-border/50 p-3 last:border-b-0 hover:bg-muted/35"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProductHandles.includes(product.handle)}
                              onChange={(event) =>
                                toggleProductHandle(product.handle, event.target.checked)
                              }
                              className="mt-4 h-4 w-4 accent-primary"
                            />
                            <div className="relative h-14 w-14 overflow-hidden rounded-md border border-border/60 bg-muted">
                              {product.images?.[0]?.src ? (
                                <img
                                  src={product.images[0].src}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {product.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {product.variants.length} variante(s) · {product.variants[0]?.price || "0.00"}
                              </p>
                              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                {product.handle}
                              </p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <aside className="space-y-4 border-t border-border/60 bg-muted/25 px-5 py-4 lg:border-l lg:border-t-0">
                {transformedPreview ? (
                  <TransformedPreviewCard preview={transformedPreview} />
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                    Clique em Visualizar para transformar 1 produto com os criterios atuais antes de importar tudo.
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Coleções reconhecidas
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Quando a origem expõe /collections.json, elas aparecem aqui para referência.
                  </p>
                </div>
                {sourceCollections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                    Nenhuma coleção pública carregada.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sourceCollections.slice(0, 20).map((collection) => (
                      <div
                        key={collection.handle}
                        className="rounded-lg border border-border/60 bg-background/55 p-3 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {collection.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            /collections/{collection.handle}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {applyProgress && (
                  <div className="rounded-lg border border-primary/25 bg-primary/8 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {applyProgress.message}
                      </p>
                      <Badge variant="secondary" className="rounded-md">
                        {applyProgress.total > 0
                          ? `${applyProgress.current}/${applyProgress.total}`
                          : "calculando"}
                      </Badge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/70">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width:
                            applyProgress.total > 0
                              ? `${Math.min(100, (applyProgress.current / applyProgress.total) * 100)}%`
                              : "8%",
                        }}
                      />
                    </div>
                  </div>
                )}
              </aside>
            </CardContent>

            <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {importMode === "bulk"
                  ? `${selectedProductHandles.length} produto(s) selecionado(s)`
                  : "Produto individual"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePreview} disabled={previewLoading || !source.trim()}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {importMode === "single" ? "Analisar produto" : "Analisar origem"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTransformPreview}
                  disabled={transformPreviewLoading || !source.trim() || !targetStoreId}
                >
                  {transformPreviewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="h-4 w-4" />
                  )}
                  Visualizar
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={
                    applyLoading ||
                    !source.trim() ||
                    !targetStoreId ||
                    (importMode === "bulk" && preview.length > 0 && selectedProductHandles.length === 0)
                  }
                >
                  {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                  Importar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {null}
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
                  min={1}
                  max={MAX_CLONE_LIMIT}
                  type="number"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Quantidade máxima lida da loja. Até {MAX_CLONE_LIMIT}.
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
        <RoutedTaskHeader
          routedView={routedView}
          hasRoutes={configs.length > 0}
          routesCount={configs.length}
        />

        {routedView === "script" &&
          (configs.length === 0 ? (
            <Card className="rounded-lg border-border/60">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Route className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-semibold text-foreground">
                  Nenhuma rota criada ainda
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  O script só funciona com o token de uma rota. Volte ao passo 2,
                  vincule a vitrine à dark store e crie a rota — o token é gerado
                  automaticamente.
                </p>
                <Link
                  href="/clone/routed-checkout/create-route"
                  className="mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Ir para o passo 2: Vincular produtos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {scriptConfig && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Token da rota</span>
                  <span className="font-semibold text-foreground">{scriptConfig.name}</span>
                  <Link
                    href="/clone/routed-checkout/active-routes"
                    className="ml-auto text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Trocar rota
                  </Link>
                </div>
              )}
              <RoutedCheckoutTutorial
                installSnippet={installSnippet}
                routeToken={installToken}
              />
            </div>
          ))}

        {routedView !== "script" && (
        <div className="grid gap-5">
        {showRoutedSetup && (
        <Card className="rounded-lg border-border/60">
          <CardContent className="space-y-5">
            {routedView === "create-route" && (
            <div className="space-y-2">
              <Label htmlFor="route-name">Nome</Label>
              <Input
                id="route-name"
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
              />
            </div>
            )}

            <div className={cn("grid gap-4", routedView === "create-route" ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
              <div className="space-y-2">
                <Label>Vitrine</Label>
                <p className="text-xs text-muted-foreground/80">
                  Onde o cliente compra (storefront com o script instalado).
                </p>
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
                <p className="text-xs text-muted-foreground/80">
                  Onde fica o checkout/pagamento (recebe o pedido roteado).
                </p>
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

              {routedView === "create-route" && (
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
              )}
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
                    {routedView === "create-route"
                      ? "Correspondências encontradas"
                      : "Produtos que serão criados"}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {routedView === "create-route"
                      ? "O app lê as duas lojas e sugere pares por SKU ou título. Depois você salva isso como rota."
                      : "O app lê a vitrine pela API da Shopify e cria equivalentes na dark store selecionada."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {routedView !== "create-route" && (
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
                  )}
                  {routedView !== "create-route" && destinationCreating && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => destinationAbortRef.current?.abort()}
                  >
                    Cancelar operação
                  </Button>
                  )}
                  {routedView === "create-route" && (
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
                  )}
                  {routedView === "create-route" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(installSnippet, "script")}
                    disabled={!installToken}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar script
                  </Button>
                  )}
                </div>
              </div>

              {routedView !== "create-route" && (
              <div className="mt-4 grid gap-4 rounded-lg border border-border/70 bg-card/70 p-4 lg:grid-cols-[260px_180px_minmax(0,1fr)] lg:items-start">
                <div className="space-y-2">
                  <Label>Estoque na dark store</Label>
                  <Select
                    value={inventoryMode}
                    onValueChange={(value) =>
                      setInventoryMode((value || "not_tracked") as InventoryMode)
                    }
                    disabled={destinationCreating}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="not_tracked">Inventory not tracked</SelectItem>
                      <SelectItem value="tracked">Definir estoque inicial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination-inventory-quantity">Quantidade</Label>
                  <Input
                    id="destination-inventory-quantity"
                    value={inventoryQuantity}
                    onChange={(event) => setInventoryQuantity(event.target.value)}
                    inputMode="numeric"
                    min={0}
                    type="number"
                    disabled={destinationCreating || inventoryMode === "not_tracked"}
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Para dark store, o recomendado é <strong>Inventory not tracked</strong>:
                  o produto fica vendável sem depender de saldo. Se quiser controle
                  real, selecione “Definir estoque inicial”.
                </p>
              </div>
              )}

              {routedView !== "create-route" && (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-border/70 bg-card/70 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={translateDestinationProducts}
                  onChange={(event) =>
                    setTranslateDestinationProducts(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  disabled={destinationCreating}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <Languages className="h-4 w-4 text-primary" />
                    Traduzir produto ao criar destino
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Quando desligado, a dark store recebe titulo, descricao, tags e SEO
                    iguais aos da vitrine. Quando ligado, a IA traduz esses textos
                    para o idioma configurado na loja destino antes de criar o produto.
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    A traducao nao altera imagens. Para limpar marcas de agua,
                    logos de loja e textos externos, use a neutralizacao IA.
                  </span>
                </span>
              </label>
              )}

              {routedView !== "create-route" && (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-border/70 bg-card/70 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={translateDestinationVariantOptions}
                  onChange={(event) =>
                    setTranslateDestinationVariantOptions(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  disabled={destinationCreating}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <Languages className="h-4 w-4 text-primary" />
                    Traduzir cores e tamanhos ao criar destino
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Use quando a dark store deve receber variantes em português.
                    Exemplos: Color vira Cor, Size vira Tamanho, blue vira azul e
                    small/S vira P.
                  </span>
                </span>
              </label>
              )}

              {routedView === "neutralize" && (
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
                      Quando ativo, o app usa Gemini para gerar uma versao stock:
                      remove logos, simbolos, marcas e textos do proprio produto,
                      alem de marcas d&apos;agua, textos externos e artefatos de marketplace.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Por segurança de tempo, a neutralização processa até 10 produtos
                      por execucao e usa o limite de midias que voce escolher.
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
                {neutralizeDestinationProducts && (
                  <div className="mt-4 space-y-2 rounded-lg border border-primary/20 bg-background/60 p-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                      <label className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/8 p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={destinationGenericizeText}
                          onChange={(event) =>
                            setDestinationGenericizeText(event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 accent-primary"
                          disabled={destinationCreating}
                        />
                        <span>
                          <span className="block font-medium text-foreground">
                            Genericizar nome, descricao e SEO
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Ex.: Air Jordan shoes vira Tenis esportivo casual.
                          </span>
                        </span>
                      </label>
                      <div className="space-y-1">
                        <Label htmlFor="destination-ai-media-limit">
                          Midias com IA/produto
                        </Label>
                        <Input
                          id="destination-ai-media-limit"
                          type="number"
                          min={1}
                          max={20}
                          value={destinationAiMediaLimit}
                          onChange={(event) =>
                            setDestinationAiMediaLimit(event.target.value)
                          }
                          className="h-10 bg-background/70"
                          disabled={destinationCreating}
                        />
                      </div>
                    </div>
                    <Label htmlFor="destination-neutralization-instructions">
                      Instruções extras para esta neutralização
                    </Label>
                    <Textarea
                      id="destination-neutralization-instructions"
                      rows={3}
                      value={destinationNeutralizationInstructions}
                      onChange={(event) =>
                        setDestinationNeutralizationInstructions(event.target.value)
                      }
                      placeholder="Ex.: manter escudos do time, remover só selo de vendedor e texto promocional."
                      className="bg-background/70 text-sm"
                      disabled={destinationCreating}
                    />
                    <p className="text-xs text-muted-foreground">
                      O comando customizado tem prioridade quando você pedir para
                      remover, manter ou alterar um detalhe específico.
                    </p>
                  </div>
                )}
              </div>
              )}

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

              {routedView === "create-route" && (routeLinkRows.length > 0 ? (
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
              ))}

              {routedView === "create-route" && (
              <details className="mt-4 rounded-lg border border-border/60 bg-card/60 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  Ver IDs técnicos lidos das lojas
                </summary>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Use esta área apenas para conferência. O fluxo normal usa as
                  correspondências e seletores acima.
                </p>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
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
              </details>
              )}

              {routedView === "create-route" && (
              <details className="mt-4 rounded-lg border border-primary/25 bg-primary/8 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  Ajustar ligação item por item
                </summary>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
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
              </details>
              )}
            </div>

            {routedView === "create-route" && (
            <details className="rounded-lg border border-border/60 bg-background/35 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                JSON avançado dos mapas
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Os campos abaixo são preenchidos automaticamente pelos seletores.
                Edite manualmente só quando precisar colar um mapa externo.
              </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
            </details>
            )}

            {routedView === "create-route" && (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="leading-6">
                  Depois de criar a rota, copie o token exibido em Rotas ativas
                  para as configurações do tema da vitrine.
                </p>
              </div>
            </div>
            )}

            {routedView === "create-route" && (() => {
              const connected = Object.keys(currentVariantMap).length;
              const total = suggestedRouteMaps.sourceVariants.length;
              const noneConnected = connected === 0;
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    noneConnected
                      ? "border-red-400/40 bg-red-500/10 text-red-300"
                      : "border-primary/30 bg-primary/8 text-foreground"
                  )}
                >
                  {noneConnected ? (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <span>
                    <strong>{connected}</strong>
                    {total > 0 ? ` de ${total}` : ""} variante(s) conectada(s).
                    {noneConnected
                      ? " Rode \"Criar destino\" (passo 1) para conectar por SKU antes de salvar."
                      : ""}
                  </span>
                </div>
              );
            })()}

            {routedView === "create-route" && (
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
            )}
          </CardContent>
        </Card>
        )}

        {routedView === "active-routes" && (
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
                {configs.map((config) => {
                  const routeSnippet = buildRoutedInstallSnippet(config.public_token);
                  return (
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
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-foreground">
                          Código completo para colar na vitrine
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(routeSnippet, "script da rota")
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar script
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={routeSnippet}
                        className="min-h-32 resize-y font-mono text-xs leading-6"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        Cole este bloco inteiro em <code>layout/theme.liquid</code>,
                        imediatamente antes de <code>&lt;/body&gt;</code>, na loja vitrine.
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                        onClick={() => handleInvertRoute(config)}
                        disabled={invertingRouteId === config.id}
                        title="Troca vitrine e dark store. Use se o cliente compra na loja que esta como dark store."
                      >
                        {invertingRouteId === config.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        )}
                        Inverter lojas
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        )}
        </div>
        )}
      </section>
      )}
    </div>
  );
}
