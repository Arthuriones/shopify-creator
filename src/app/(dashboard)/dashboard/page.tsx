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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const primaryActions = [
  {
    href: "/clone/shopify/individual",
    title: "Importar produto individual",
    description: "Use uma URL de produto Shopify e publique apenas o item selecionado.",
    icon: PackageCheck,
  },
  {
    href: "/clone/shopify/bulk",
    title: "Importar loja em massa",
    description: "Analise catálogo, escolha produtos e preserve coleções na loja destino.",
    icon: Boxes,
  },
  {
    href: "/clone/routed-checkout/create-route",
    title: "Vincular routed checkout",
    description: "Mapeie produtos da vitrine para variantes da dark store.",
    icon: GitBranch,
  },
];

const secondaryActions = [
  { href: "/stores", label: "Conectar lojas", icon: Store },
  { href: "/store-setup", label: "Setup da loja", icon: Settings2 },
  { href: "/optimizer", label: "Otimizar com IA", icon: Sparkles },
  { href: "/reviews", label: "Gerar reviews", icon: MessageSquareText },
];

import { PageHeader } from "@/components/layout/page-header";

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Painel de trabalho"
        description="Acesse direto as operações principais. Sem métricas decorativas: cada bloco abaixo leva a uma ação real do projeto."
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {primaryActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-lg border border-border/60 bg-card p-5 shadow-sm transition-colors hover:border-primary/45 hover:bg-card/85"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/12 text-primary">
                <action.icon className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-foreground">
              {action.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {action.description}
            </p>
          </Link>
        ))}
      </section>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Ferramentas de apoio</CardTitle>
          <CardDescription>
            Recursos que preparam loja, conteúdo e material de venda.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex h-12 items-center gap-3 rounded-md border border-border/60 bg-background/45 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/8"
            >
              <action.icon className="h-4 w-4 text-primary" />
              {action.label}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
