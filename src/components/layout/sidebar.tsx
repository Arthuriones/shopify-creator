"use client";

import type { CSSProperties, ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Boxes,
  Camera,
  Download,
  Globe2,
  LayoutDashboard,
  Package,
  PackageCheck,
  Settings2,
  Sparkles,
  Store,
  MessageSquareText,
  Workflow,
} from "lucide-react";

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
    label: "Geral",
    items: [
      {
        href: "/dashboard",
        label: "Visao geral",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Shopify",
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
      {
        href: "/products/catalog",
        label: "Catálogo Shopify",
        icon: Boxes,
      },
      {
        href: "/clone/shopify",
        label: "Clonar loja",
        icon: Download,
        children: [
          { href: "/clone/shopify/individual", label: "Produto individual" },
          { href: "/clone/shopify/bulk", label: "Importação em massa" },
          { href: "/clone/export", label: "Exportar catálogo" },
        ],
      },
    ],
  },
  {
    label: "Importação global",
    items: [
      {
        href: "/bulk",
        label: "Importar URLs",
        icon: PackageCheck,
      },
      {
        href: "/multi-site",
        label: "Diversos sites",
        icon: Globe2,
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
    ],
  },
  {
    label: "Routed checkout",
    items: [
      {
        href: "/clone/routed-checkout",
        label: "Routed checkout",
        icon: Workflow,
        children: [
          { href: "/clone/routed-checkout", label: "Visão do fluxo" },
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
    label: "Canais e conteudo",
    items: [
      {
        href: "/instagram",
        label: "Instagram",
        icon: Camera,
      },
      {
        href: "/optimizer",
        label: "Otimizador",
        icon: Sparkles,
      },
      {
        href: "/reviews",
        label: "Reviews IA",
        icon: MessageSquareText,
      },
    ],
  },
];

const mobileNavItems: NavItem[] = [
  navSections[0].items[0],
  navSections[1].items[0],
  navSections[1].items[3],
  navSections[4].items[0],
  navSections[5].items[0],
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

  return (
    <>
      <aside className="fixed left-0 top-[72px] z-40 hidden h-[calc(100vh-72px)] w-[280px] flex-col border-r border-border bg-sidebar md:flex">
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-6">
            {navSections.map((section) => (
              <div key={section.label} className="space-y-1.5">
                <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {section.label}
                </div>
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
                          "group relative flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.98]",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : hasActiveChild || isExpanded
                              ? "bg-muted text-foreground"
                              : "text-foreground/75 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {(isActive || hasActiveChild) && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-md bg-primary" />
                        )}
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive || hasActiveChild ? "text-primary" : "text-muted-foreground group-hover:text-foreground/70"
                          )}
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                      {item.children && (isExpanded || hasActiveChild) && (
                        <div className="ml-[1.35rem] space-y-1 border-l border-border pb-1 pl-4 pt-1">
                          {item.children.map((child, index) => {
                            const childActive = isHrefActive(child.href, true);
                            return (
                              <Link
                                key={`${child.label}-${index}`}
                                href={child.href}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                                  childActive
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
      </aside>

      {/* Mobile nav bar at bottom */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card px-2 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = item.children
            ? isItemExpanded(item)
            : isHrefActive(item.href, true);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[64px] h-full transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
