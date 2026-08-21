"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Link2,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  UploadCloud,
  Workflow,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// title/desc guardam chaves do namespace dashboard.*
const quickActions = [
  {
    href: "/clone/shopify/individual",
    title: "actionImportTitle",
    desc: "actionImportDesc",
    icon: Link2,
    tint: "text-sky-400 bg-sky-500/10",
  },
  {
    href: "/clone/shopify/bulk",
    title: "actionBulkTitle",
    desc: "actionBulkDesc",
    icon: UploadCloud,
    tint: "text-indigo-400 bg-indigo-500/10",
  },
  {
    href: "/clone/shopify",
    title: "actionCloneTitle",
    desc: "actionCloneDesc",
    icon: Store,
    tint: "text-emerald-400 bg-emerald-500/10",
  },
  {
    href: "/clone/routed-checkout",
    title: "actionShowcaseTitle",
    desc: "actionShowcaseDesc",
    icon: Workflow,
    tint: "text-orange-400 bg-orange-500/10",
  },
];

type ProductStatus = "pending" | "optimized" | "published" | "failed";

interface RecentProduct {
  id: string;
  title: string;
  status: ProductStatus;
  created_at: string;
}

// label = chave do namespace status.*
const STATUS_META: Record<
  ProductStatus,
  { label: ProductStatus; icon: typeof CircleDashed; tint: string }
> = {
  pending: { label: "pending", icon: CircleDashed, tint: "text-sky-400" },
  optimized: { label: "optimized", icon: Sparkles, tint: "text-indigo-400" },
  published: { label: "published", icon: CheckCircle2, tint: "text-emerald-400" },
  failed: { label: "failed", icon: XCircle, tint: "text-red-400" },
};


function displayName(
  user: { user_metadata?: Record<string, unknown>; email?: string } | null
): string {
  const meta = user?.user_metadata ?? {};
  const raw =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (user?.email ? user.email.split("@")[0] : "");
  if (!raw) return "";
  const first = raw.trim().split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tStatus = useTranslations("status");
  const tTime = useTranslations("time");
  // "agora" fica no estado em vez de vir de Date.now() no meio do render.
  // Ler o relogio durante o render e impuro: dois renders do mesmo estado
  // produzem telas diferentes. De quebra, o intervalo faz "ha 2 minutos"
  // virar "ha 3 minutos" sozinho, sem precisar recarregar a pagina.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fmtTime = (iso: string): string => {
    const diff = agora - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return tTime("now");
    if (min < 60) return tTime("minsAgo", { n: min });
    const hours = Math.floor(min / 60);
    if (hours < 24) return tTime("hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return tTime("daysAgo", { n: days });
    return new Date(iso).toLocaleDateString();
  };
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [storeCount, setStoreCount] = useState(0);
  // Alguma loja com perfil preenchido (nicho)? Sem isso a IA fica bloqueada.
  const [hasCompleteProfile, setHasCompleteProfile] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [recent, setRecent] = useState<RecentProduct[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();

      const [{ data: userData }, stores, products, published, recentProducts] =
        await Promise.all([
          supabase.auth.getUser(),
          // Traz o nicho junto: e ele que define se o perfil da loja esta
          // completo, e o perfil e o que destrava toda a IA do produto.
          supabase.from("stores").select("id, niche", { count: "exact" }),
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("status", "published"),
          supabase
            .from("products")
            .select("id, title, status, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      if (!active) return;

      setName(displayName(userData?.user ?? null));
      setStoreCount(stores.count ?? 0);
      setHasCompleteProfile(
        ((stores.data as { niche?: string | null }[] | null) ?? []).some(
          (store) => Boolean(store.niche && store.niche.trim())
        )
      );
      setProductCount(products.count ?? 0);
      setPublishedCount(published.count ?? 0);
      setRecent((recentProducts.data as RecentProduct[] | null) ?? []);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const stats = [
    { label: t("statConnectedStores"), value: storeCount, icon: Store, tint: "text-sky-400 bg-sky-500/10" },
    { label: t("statImportedProducts"), value: productCount, icon: Boxes, tint: "text-indigo-400 bg-indigo-500/10" },
    { label: t("statPublishedProducts"), value: publishedCount, icon: ShoppingBag, tint: "text-emerald-400 bg-emerald-500/10" },
  ];

  const noStores = !loading && storeCount === 0;

  // Passos de ativacao. Enquanto algum estiver pendente o checklist aparece.
  const checklist = [
    {
      key: "store",
      label: t("checklistStore"),
      href: "/stores",
      done: storeCount > 0,
    },
    {
      key: "profile",
      label: t("checklistProfile"),
      href: "/stores",
      done: hasCompleteProfile,
    },
    {
      key: "product",
      label: t("checklistProduct"),
      href: "/clone/shopify/individual",
      done: productCount > 0,
    },
  ];
  const showChecklist = !loading && checklist.some((step) => !step.done);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Greeting */}
      <div>
        <h1 className="text-[2rem] font-heading font-bold tracking-tight text-foreground">
          {loading ? (
            <span className="skeleton inline-block h-9 w-64 rounded-lg align-middle" />
          ) : (
            <>{t("greeting", { name: name || tTime("you") })}</>
          )}
        </h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Checklist de primeiros passos. Antes existia so um empty state com um
          botao: quem ja tinha conectado a loja nao recebia nenhuma orientacao e
          ficava sem saber que o perfil (nicho) e o que destrava a IA. */}
      {showChecklist && (
        <div className="rounded-2xl border border-border bg-card/70 p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rocket className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-heading font-bold tracking-tight text-foreground">
                {t("checklistTitle")}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t("checklistSubtitle", {
                  done: checklist.filter((step) => step.done).length,
                  total: checklist.length,
                })}
              </p>
            </div>
          </div>

          <ol className="mt-5 space-y-2">
            {checklist.map((step, index) => (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    step.done
                      ? "border-border/50 bg-background/40"
                      : "border-primary/30 bg-primary/5 hover:border-primary/60"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 text-[11px] font-semibold text-primary">
                      {index + 1}
                    </span>
                  )}
                  <span
                    className={`flex-1 text-[14px] ${
                      step.done
                        ? "text-muted-foreground line-through"
                        : "font-semibold text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  {!step.done && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {noStores ? null : (
        <>
          {/* Stat cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-border bg-card/70 p-5 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tint}`}>
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="pt-0.5 text-[13px] text-muted-foreground">{s.label}</span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  {loading ? (
                    <span className="skeleton h-7 w-16 rounded-md" />
                  ) : (
                    <span className="text-[1.75rem] font-heading font-bold leading-none text-foreground">
                      {s.value.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* Quick actions */}
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-heading font-bold tracking-tight text-foreground">
                {t("quickActions")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group rounded-2xl border border-border bg-card/70 p-5 transition-all hover:border-primary/40 hover:bg-card active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.tint}`}>
                      <a.icon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{t(a.title)}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t(a.desc)}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <div className="rounded-2xl border border-border bg-card/70 p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold tracking-tight text-foreground">
                  {t("recentProducts")}
                </h2>
                <Link
                  href="/products/catalog"
                  className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("viewCatalog")}
                </Link>
              </div>

              {loading ? (
                <div className="space-y-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3.5 px-2 py-2.5">
                      <div className="skeleton h-9 w-9 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3.5 w-48 rounded" />
                        <div className="skeleton h-3 w-24 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[14px] text-muted-foreground">
                    {t("noProducts")}
                  </p>
                  <Link
                    href="/clone/shopify/individual"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Link2 className="h-4 w-4" /> {t("importFirst")}
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {recent.map((item) => {
                    const meta = STATUS_META[item.status] ?? STATUS_META.pending;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] ${meta.tint}`}>
                          <meta.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-foreground">{item.title}</p>
                          <p className="truncate text-[12px] text-muted-foreground">{tStatus(meta.label)}</p>
                        </div>
                        <span className="shrink-0 text-[12px] text-muted-foreground">
                          {fmtTime(item.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
