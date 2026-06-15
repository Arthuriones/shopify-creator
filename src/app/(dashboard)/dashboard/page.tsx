"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  GitBranch,
  MessageSquareText,
  PackageCheck,
  Settings2,
  Sparkles,
  Store,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Painel de Controle"
        description="Acesse suas operações principais. Cada bloco abaixo leva a uma ação vital do seu fluxo de dropshipping e automação."
      />

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <Link
          href="/clone/shopify/individual"
          className="group relative grid min-h-[360px] overflow-hidden rounded-lg border border-border bg-card p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition-all duration-200 hover:border-primary/35 hover:shadow-[0_24px_48px_rgba(15,23,42,0.08)]"
        >
          <div className="pointer-events-none absolute right-8 top-8 hidden opacity-[0.08] lg:block">
            <PackageCheck className="h-48 w-48 text-primary" />
          </div>
          <div className="relative z-10 max-w-[520px]">
            <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-primary">
              <PackageCheck className="h-6 w-6" />
            </span>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Fluxo principal
            </p>
            <h2 className="mb-4 text-3xl font-heading font-black tracking-tight text-foreground lg:text-[2.6rem]">
              Importação individual
            </h2>
            <p className="max-w-[34rem] text-base leading-7 text-muted-foreground">
              Use uma URL de produto Shopify e publique apenas o item selecionado instantaneamente.
            </p>
          </div>
          <div className="relative z-10 mt-10 flex items-center text-sm font-semibold text-primary transition-transform group-hover:translate-x-1">
            Começar agora <ArrowRight className="ml-2 h-4 w-4" />
          </div>
        </Link>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <Link
            href="/clone/shopify/bulk"
            className="group rounded-lg bg-brand-gradient p-7 text-primary-foreground shadow-[0_18px_40px_rgba(34,112,255,0.24)] transition-all duration-200 hover:brightness-[1.03]"
          >
            <Boxes className="mb-5 h-9 w-9 opacity-95" />
            <h2 className="mb-2 text-2xl font-heading font-extrabold tracking-tight">
              Importação em massa
            </h2>
            <p className="text-sm leading-6 text-primary-foreground/84">
              Analise o catálogo completo e extraia múltiplos produtos de uma só vez.
            </p>
            <div className="mt-8 flex items-center text-sm font-semibold">
              Clonar loja <ArrowRight className="ml-2 h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/clone/routed-checkout/create-route"
            className="group rounded-lg border border-border bg-card p-7 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-primary/30"
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
              <GitBranch className="h-5 w-5" />
            </span>
            <h2 className="mb-2 text-xl font-heading font-bold tracking-tight text-foreground">
              Routed Checkout
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Mapeie produtos da vitrine para as variantes da dark store oculta.
            </p>
            <div className="mt-8 flex items-center text-sm font-semibold text-primary">
              Vincular agora <ArrowRight className="ml-2 h-4 w-4" />
            </div>
          </Link>
        </div>
      </section>

      <div className="pt-4">
        <h3 className="mb-5 text-xl font-heading font-bold tracking-tight">Ferramentas de apoio</h3>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/stores", label: "Lojas", icon: Store },
            { href: "/store-setup", label: "Setup", icon: Settings2 },
            { href: "/optimizer", label: "IA Optimizer", icon: Sparkles },
            { href: "/reviews", label: "Reviews IA", icon: MessageSquareText },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex min-h-[170px] flex-col items-start justify-between rounded-lg border border-border bg-card p-5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition-colors hover:border-primary/30 hover:bg-card active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
                <action.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold text-foreground">{action.label}</div>
                <div className="mt-2 flex items-center text-sm font-medium text-primary">
                  Abrir <ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
