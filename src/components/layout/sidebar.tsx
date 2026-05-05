"use client";

import type { CSSProperties, ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Boxes,
  Copy,
  Download,
  FileJson,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Package,
  PackageCheck,
  Route,
  Settings2,
  Sparkles,
  Store,
  WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  children?: { href: string; label: string }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Operacao",
    items: [
      {
        href: "/dashboard",
        label: "Visao geral",
        description: "Resumo das operacoes",
        icon: LayoutDashboard,
      },
      {
        href: "/stores",
        label: "Lojas conectadas",
        description: "Credenciais e conexoes Shopify",
        icon: Store,
      },
    ],
  },
  {
    label: "Produtos",
    items: [
      {
        href: "/products",
        label: "Produtos gerados",
        description: "Edicao e publicacao",
        icon: Package,
      },
      {
        href: "/products/catalog",
        label: "Catalogo Shopify",
        description: "Produtos lidos das lojas",
        icon: Boxes,
      },
      {
        href: "/bulk",
        label: "Importacao em lote",
        description: "Fila de importacao",
        icon: PackageCheck,
      },
      {
        href: "/optimizer",
        label: "Otimizador IA",
        description: "Texto, SEO e imagem",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "Clone e checkout",
    items: [
      {
        href: "/clone",
        label: "Central de clone",
        description: "Escolha o recurso",
        icon: Copy,
      },
      {
        href: "/clone/shopify",
        label: "Clonar loja Shopify",
        description: "Importar vitrine publica",
        icon: Download,
      },
      {
        href: "/clone/export",
        label: "Exportar catalogo",
        description: "JSON ou CSV",
        icon: FileJson,
      },
      {
        href: "/clone/routed-checkout",
        label: "Routed checkout",
        description: "Vitrine para dark store",
        icon: GitBranch,
        children: [
          { href: "/clone/routed-checkout", label: "Criar rota" },
          { href: "/clone/routed-checkout", label: "Criar destino" },
          { href: "/clone/routed-checkout", label: "Neutralizar produtos" },
          { href: "/clone/routed-checkout", label: "Script do tema" },
        ],
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        href: "/store-setup",
        label: "Setup da loja",
        description: "Politicas, menus e paginas",
        icon: Settings2,
      },
      {
        href: "/clone/routed-checkout",
        label: "Rotas ativas",
        description: "Tokens e scripts",
        icon: Route,
      },
      {
        href: "/clone/routed-checkout",
        label: "Neutralizacao IA",
        description: "Produtos sem marca",
        icon: WandSparkles,
      },
    ],
  },
];

const mobileNavItems: NavItem[] = [
  navSections[0].items[0],
  navSections[0].items[1],
  navSections[1].items[0],
  navSections[2].items[0],
  navSections[3].items[0],
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[304px] flex-col border-r border-sidebar-border bg-sidebar/95 shadow-xl shadow-primary/10 md:flex">
        <div className="border-b border-sidebar-border px-6 pb-5 pt-6">
          <div
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-primary/25"
            style={{ background: "linear-gradient(160deg, oklch(0.82 0.2 153), oklch(0.74 0.17 160))" }}
          >
            <Package className="h-5 w-5" style={{ color: "oklch(0.13 0.02 155)" }} />
          </div>
          <p
            className="font-heading text-2xl font-bold text-sidebar-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            Shopify Creator
          </p>
          <p className="mt-2 text-[0.95rem] leading-6 text-sidebar-foreground/75">
            Importe, clone, personalize e publique na sua loja.
          </p>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-1.5">
              <p className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {section.label}
              </p>
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const hasActiveChild = item.children?.some(
                  (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
                );
                return (
                  <div key={`${section.label}-${item.label}`} className="space-y-1">
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-semibold transition-all duration-200",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm shadow-primary/10"
                          : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                      )}
                    >
                      {(isActive || hasActiveChild) && (
                        <div
                          className="absolute left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full animate-fade-in"
                          style={{ background: "oklch(0.79 0.184 154)" }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors duration-200",
                          isActive || hasActiveChild
                            ? "text-[oklch(0.79_0.184_154)]"
                            : "text-muted-foreground group-hover:text-sidebar-foreground"
                        )}
                        style={isActive || hasActiveChild ? { color: "oklch(0.79 0.184 154)" } : undefined}
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.description ? (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-sidebar-foreground/52">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                    {item.children && isActive && (
                      <div className="space-y-1 pl-10">
                        {item.children.map((child, index) => (
                          <Link
                            key={`${child.label}-${index}`}
                            href={child.href}
                            className="block rounded-md px-3 py-1.5 text-[13px] font-semibold text-sidebar-foreground/62 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-[16px] font-semibold text-sidebar-foreground/75 transition-all duration-200 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-sidebar-border/70 bg-sidebar/95 px-4 backdrop-blur-md md:hidden">
        <Link href="/products" className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(160deg, oklch(0.82 0.2 153), oklch(0.74 0.17 160))" }}
          >
            <Package className="h-4 w-4" style={{ color: "oklch(0.13 0.02 155)" }} />
          </div>
          <span className="font-heading text-base font-semibold text-sidebar-foreground">
            Shopify Creator
          </span>
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground"
        >
          Sair
        </button>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-sidebar-border/70 bg-sidebar/95 px-1 py-1 backdrop-blur-md md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[76px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
