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

      {/* BENTO GRID */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[220px]">
        
        {/* BLOCK 1: Importar Produto Individual (LARGE) */}
        <Link
          href="/clone/shopify/individual"
          className="group relative overflow-hidden rounded-3xl bg-card/60 backdrop-blur-md border border-white/10 dark:border-white/5 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 md:col-span-2 lg:col-span-2 lg:row-span-2 flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <PackageCheck className="w-64 h-64 text-primary translate-x-12 -translate-y-12" />
          </div>
          <div className="relative z-10">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 group-hover:scale-110 transition-transform">
              <PackageCheck className="h-7 w-7" />
            </span>
            <h2 className="text-4xl font-heading font-black tracking-tighter text-foreground mb-4">
              Importação <br /> Individual
            </h2>
            <p className="text-muted-foreground text-lg max-w-sm leading-relaxed">
              Use uma URL de produto Shopify e publique apenas o item selecionado instantaneamente.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-primary font-bold text-lg mt-8 group-hover:translate-x-2 transition-transform">
            Começar agora <ArrowRight className="ml-2 h-6 w-6" />
          </div>
        </Link>

        {/* BLOCK 2: Importar loja em massa */}
        <Link
          href="/clone/shopify/bulk"
          className="group relative overflow-hidden rounded-3xl bg-brand-gradient p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.2)] transition-all duration-300 flex flex-col justify-between hover:scale-[1.02]"
        >
          <div className="relative z-10 text-white">
            <Boxes className="h-10 w-10 mb-5 opacity-90" />
            <h2 className="text-2xl font-heading font-extrabold tracking-tight mb-2">
              Importação <br/> em Massa
            </h2>
            <p className="text-white/80 text-sm leading-relaxed mt-2">
              Analise o catálogo completo e extraia múltiplos produtos de uma só vez.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-white font-bold mt-4 group-hover:translate-x-2 transition-transform">
            Clonar loja <ArrowRight className="ml-2 h-5 w-5" />
          </div>
        </Link>

        {/* BLOCK 3: Vincular routed checkout */}
        <Link
          href="/clone/routed-checkout/create-route"
          className="group relative overflow-hidden rounded-3xl bg-card/60 backdrop-blur-md border border-white/10 dark:border-white/5 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col justify-between"
        >
          <div className="relative z-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5">
              <GitBranch className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-heading font-bold tracking-tight text-foreground mb-2">
              Routed Checkout
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Mapeie produtos da vitrine para as variantes da dark store oculta.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-primary font-bold mt-4 group-hover:translate-x-2 transition-transform">
            Vincular agora <ArrowRight className="ml-2 h-4 w-4" />
          </div>
        </Link>
      </section>

      {/* SECONDARY TOOLS BENTO */}
      <div className="pt-8">
        <h3 className="text-2xl font-heading font-bold mb-6 tracking-tight">Ferramentas de Apoio</h3>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: "/stores", label: "Lojas", icon: Store },
            { href: "/store-setup", label: "Setup", icon: Settings2 },
            { href: "/optimizer", label: "IA Optimizer", icon: Sparkles },
            { href: "/reviews", label: "Reviews IA", icon: MessageSquareText },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col items-center justify-center gap-4 rounded-3xl bg-card/40 backdrop-blur-md border border-white/5 p-6 hover:bg-card/80 shadow-sm hover:shadow-md transition-all duration-300 text-center active:scale-95"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background shadow-sm text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all duration-300">
                <action.icon className="h-6 w-6" />
              </span>
              <span className="font-semibold text-sm text-foreground">{action.label}</span>
            </Link>
          ))}
        </section>
      </div>

    </div>
  );
}
