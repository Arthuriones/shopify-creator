"use client";

import type { CSSProperties, ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Store, Package, Sparkles, Settings2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  children?: { href: string; label: string }[];
}

const navItems: NavItem[] = [
  { href: "/stores", label: "Lojas", icon: Store },
  {
    href: "/products",
    label: "Produtos",
    icon: Package,
    children: [{ href: "/products/catalog", label: "Catalogo" }],
  },
  { href: "/optimizer", label: "Otimizador", icon: Sparkles },
  { href: "/store-setup", label: "Setup da Loja", icon: Settings2 },
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
      <aside className="sticky top-0 hidden h-screen w-[274px] flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-md md:flex">
        <div className="border-b border-sidebar-border/70 px-5 pb-4 pt-5">
          <div
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-primary/25"
            style={{ background: "linear-gradient(160deg, oklch(0.82 0.2 153), oklch(0.74 0.17 160))" }}
          >
            <Package className="h-5 w-5" style={{ color: "oklch(0.13 0.02 155)" }} />
          </div>
          <p
            className="font-heading text-xl font-semibold text-sidebar-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            Shopify Creator
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe do AliExpress, personalize e publique na sua loja.
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const hasActiveChild = item.children?.some(
              (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
            );
            return (
              <div key={item.href} className="space-y-1">
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground shadow-sm shadow-black/20"
                      : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                  )}
                >
                  {(isActive || hasActiveChild) && (
                    <div
                      className="absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full animate-fade-in"
                      style={{ background: "oklch(0.79 0.184 154)" }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      "h-4 w-4 transition-colors duration-200",
                      isActive || hasActiveChild
                        ? "text-[oklch(0.79_0.184_154)]"
                        : "text-muted-foreground group-hover:text-sidebar-foreground"
                    )}
                    style={isActive || hasActiveChild ? { color: "oklch(0.79 0.184 154)" } : undefined}
                  />
                  {item.label}
                </Link>
                {item.children && (
                  <div className="space-y-1 pl-10">
                    {item.children.map((child) => {
                      const isChildActive =
                        pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                            isChildActive
                              ? "bg-sidebar-accent/80 text-sidebar-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
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
        </nav>

        <div className="border-t border-sidebar-border/70 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
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

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-sidebar-border/70 bg-sidebar/95 px-1 py-1 backdrop-blur-md md:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
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
