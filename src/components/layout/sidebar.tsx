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
  LayoutDashboard,
  LogOut,
  Package,
  PackageCheck,
  Settings2,
  Sparkles,
  Store,
  MessageSquareText,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  children?: { href: string; label: string }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Inicio",
    items: [
      {
        href: "/dashboard",
        label: "Visao geral",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Lojas e setup",
    items: [
      {
        href: "/stores",
        label: "Lojas conectadas",
        icon: Store,
      },
      {
        href: "/store-setup",
        label: "Setup da loja",
        icon: Settings2,
      },
    ],
  },
  {
    label: "Produtos",
    items: [
      {
        href: "/products",
        label: "Produtos gerados",
        icon: Package,
      },
      {
        href: "/products/catalog",
        label: "Catalogo Shopify",
        icon: Boxes,
      },
    ],
  },
  {
    label: "Importacao e clone",
    items: [
      {
        href: "/bulk",
        label: "Importacao em lote",
        icon: PackageCheck,
      },
      {
        href: "/clone",
        label: "Central de clone",
        icon: Copy,
      },
      {
        href: "/clone/shopify",
        label: "Clonar loja Shopify",
        icon: Download,
      },
      {
        href: "/clone/export",
        label: "Exportar catalogo",
        icon: FileJson,
      },
    ],
  },
  {
    label: "Checkout roteado",
    items: [
      {
        href: "/clone/routed-checkout",
        label: "Visao do fluxo",
        icon: Workflow,
        children: [
          { href: "/clone/routed-checkout/create-destination", label: "1. Criar destino" },
          { href: "/clone/routed-checkout/create-route", label: "2. Vincular produtos" },
          { href: "/clone/routed-checkout/script", label: "3. Instalar script" },
          { href: "/clone/routed-checkout/active-routes", label: "Rotas e tokens" },
          { href: "/clone/routed-checkout/neutralize", label: "Neutralizacao IA" },
        ],
      },
    ],
  },
  {
    label: "IA e conteudo",
    items: [
      {
        href: "/optimizer",
        label: "Otimizador IA",
        icon: Sparkles,
      },
      {
        href: "/reviews",
        label: "Gerador de reviews",
        icon: MessageSquareText,
      },
    ],
  },
];

const mobileNavItems: NavItem[] = [
  navSections[0].items[0],
  navSections[1].items[0],
  navSections[2].items[0],
  navSections[3].items[1],
  navSections[4].items[0],
];

function splitHref(href: string) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  return {
    path,
    section: params.get("section") || "",
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function isHrefActive(href: string, exact = false) {
    const target = splitHref(href);
    if (exact) {
      return pathname === target.path;
    }
    if (pathname !== target.path && !pathname.startsWith(`${target.path}/`)) {
      return false;
    }
    return true;
  }

  function isItemExpanded(item: NavItem) {
    const target = splitHref(item.href);
    return pathname === target.path || pathname.startsWith(`${target.path}/`);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[264px] flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm shadow-primary/20"
              style={{ background: "linear-gradient(160deg, oklch(0.82 0.2 153), oklch(0.74 0.17 160))" }}
            >
              <Package className="h-4 w-4" style={{ color: "oklch(0.13 0.02 155)" }} />
            </div>
            <span
              className="truncate font-heading text-lg font-bold text-sidebar-foreground"
              style={{ letterSpacing: "-0.01em" }}
            >
              Shopify Creator
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-3">
            {navSections.map((section) => (
              <div key={section.label} className="space-y-1">
                {section.items.map((item) => {
                  const isActive = isHrefActive(item.href, true);
                  const isExpanded = item.children ? isItemExpanded(item) : false;
                  const hasActiveChild = item.children?.some((child) =>
                    isHrefActive(child.href, true)
                  );
                  return (
                    <div key={`${section.label}-${item.label}`} className="space-y-1">
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex h-10 items-center gap-3 rounded-md px-3 text-[14px] font-semibold transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : hasActiveChild || isExpanded
                              ? "bg-sidebar-accent/35 text-sidebar-foreground"
                              : "text-sidebar-foreground/68 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                        )}
                      >
                        {(isActive || hasActiveChild) && (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
                            style={{ background: "oklch(0.79 0.184 154)" }}
                          />
                        )}
                        <item.icon
                          className="h-4 w-4 shrink-0"
                          style={
                            isActive || hasActiveChild
                              ? { color: "oklch(0.79 0.184 154)" }
                              : undefined
                          }
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                      {item.children && (isExpanded || hasActiveChild) && (
                        <div className="space-y-1 border-l border-sidebar-border/80 pb-1 pl-4 pt-1 ml-5">
                          {item.children.map((child, index) => {
                            const childActive = isHrefActive(child.href, true);
                            return (
                              <Link
                                key={`${child.label}-${index}`}
                                href={child.href}
                                className={cn(
                                  "block rounded-md px-3 py-2 text-[13px] font-semibold transition-colors",
                                  childActive
                                    ? "bg-sidebar-accent/70 text-sidebar-foreground"
                                    : "text-sidebar-foreground/58 hover:bg-sidebar-accent/45 hover:text-sidebar-foreground"
                                )}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={handleLogout}
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-[14px] font-semibold text-sidebar-foreground/68 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
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
          const isActive = item.children
            ? isItemExpanded(item)
            : isHrefActive(item.href, true);
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
