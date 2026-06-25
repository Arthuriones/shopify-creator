import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Globe2,
  ImageOff,
  Languages,
  Route,
  ShoppingBag,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { PRO_PRICE_BRL, PRO_INCLUDED_CREDITS, CREDIT_PACKS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "xcart — Clone qualquer loja para a Shopify em minutos",
  description:
    "Importe produtos de Shopify, WooCommerce, Shoplazza e AliExpress, traduza para PT-BR, neutralize imagens com IA e publique direto na sua Shopify. Checkout roteado e setup completo da loja.",
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://user.xcart.app";
const loginUrl = `${appUrl}/login`;

const FEATURES = [
  {
    icon: ShoppingBag,
    title: "Importe de qualquer fonte",
    desc: "Shopify, WooCommerce, Shoplazza e AliExpress. Cola o link, a xcart detecta a plataforma e puxa produtos, variantes, preços e imagens.",
  },
  {
    icon: Languages,
    title: "Tradução automática",
    desc: "Títulos, descrições e variantes traduzidos para português ou espanhol com IA, no tom certo pro seu público.",
  },
  {
    icon: ImageOff,
    title: "Neutralização de imagens",
    desc: "Remove marcas e watermarks das fotos com IA. As imagens já sobem prontas pra Shopify — você gasta 1 crédito por imagem.",
  },
  {
    icon: Route,
    title: "Checkout roteado",
    desc: "Vitrine e loja de checkout separadas. O carrinho é resolvido por SKU em runtime, com moeda e domínio por mercado.",
  },
  {
    icon: Store,
    title: "Setup completo da loja",
    desc: "Policies (CDC/LGPD), menus, páginas (Sobre, Contato, Rastreamento, FAQ) e footer gerados e publicados em um clique.",
  },
  {
    icon: Zap,
    title: "Clonagem ilimitada",
    desc: "Clone quantas lojas e produtos quiser. Sem trava por quantidade — só as imagens neutralizadas consomem créditos.",
  },
];

const STEPS = [
  { n: "1", title: "Conecte sua Shopify", desc: "Cole o domínio e as credenciais do app. Token renovado automaticamente." },
  { n: "2", title: "Cole o link da loja origem", desc: "A xcart detecta a plataforma e importa tudo: produtos, variantes e fotos." },
  { n: "3", title: "Traduza e neutralize", desc: "IA ajusta textos pro seu público e limpa as imagens das marcas." },
  { n: "4", title: "Publique", desc: "Produtos no ar na sua Shopify, com checkout roteado se quiser." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/lp" className="flex items-center">
            <img src="/logo.png" alt="xcart" className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
            <a href="#precos" className="hover:text-foreground">Preços</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href={loginUrl} className="text-sm text-muted-foreground hover:text-foreground">
              Entrar
            </Link>
            <Link
              href={loginUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Começar <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
        <div className="relative z-10 mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Importa de Shopify, WooCommerce, Shoplazza e AliExpress
          </div>
          <h1 className="mx-auto max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Clone qualquer loja para a{" "}
            <span className="text-primary">Shopify</span> em minutos
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Importe produtos, traduza para o seu público, neutralize as imagens
            com IA e publique direto na sua Shopify. Tudo numa ferramenta só.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={loginUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition hover:opacity-90"
            >
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#precos"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-medium transition hover:bg-muted"
            >
              Ver preços
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Clonagem ilimitada · Tradução automática · {PRO_INCLUDED_CREDITS} imagens/mês inclusas
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">Tudo pra montar a loja rápido</h2>
          <p className="mt-3 text-muted-foreground">
            Da importação à publicação, sem trabalho manual repetitivo.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-border/60 bg-card p-6 transition hover:border-primary/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="border-y border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Quatro passos do link à loja no ar.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preços */}
      <section id="precos" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">Preço simples</h2>
          <p className="mt-3 text-muted-foreground">
            Um plano com tudo liberado. Pague só por imagem neutralizada a mais.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-[1.2fr_1fr]">
          {/* Plano Pro */}
          <div className="relative rounded-3xl border-2 border-primary bg-card p-8">
            <div className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Mais popular
            </div>
            <h3 className="text-lg font-semibold">Pro</h3>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-5xl font-bold">R${PRO_PRICE_BRL}</span>
              <span className="mb-1.5 text-muted-foreground">/mês</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Clonagem ilimitada de lojas e produtos",
                "Importação de Shopify, WooCommerce, Shoplazza e AliExpress",
                "Tradução automática para PT-BR e ES",
                `${PRO_INCLUDED_CREDITS} imagens neutralizadas por mês inclusas`,
                "Checkout roteado por SKU",
                "Setup completo da loja (policies, menus, páginas)",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href={loginUrl}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
            >
              Assinar Pro <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Recargas de crédito */}
          <div className="rounded-3xl border border-border/60 bg-card p-8">
            <div className="flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Créditos extras</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              1 crédito = 1 imagem neutralizada. Recarregue quando precisar, sem
              mudar de plano.
            </p>
            <ul className="mt-6 space-y-3">
              {CREDIT_PACKS.map((pack) => (
                <li
                  key={pack.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{pack.label}</span>
                  <span className="text-muted-foreground">
                    R${(pack.amountCents / 100).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Compre dentro do app, na aba de cobrança.
            </p>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            Comece a clonar hoje
          </h2>
          <p className="mt-3 text-muted-foreground">
            Crie sua conta e publique a primeira loja em minutos.
          </p>
          <Link
            href={loginUrl}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 text-base font-medium text-primary-foreground transition hover:opacity-90"
          >
            Começar agora <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <img src="/logo.png" alt="xcart" className="h-6 w-auto" />
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-foreground">Privacidade</Link>
            <Link href="/terms" className="hover:text-foreground">Termos</Link>
            <Link href={loginUrl} className="hover:text-foreground">Entrar</Link>
          </div>
          <p>© {new Date().getFullYear()} xcart</p>
        </div>
      </footer>
    </div>
  );
}
