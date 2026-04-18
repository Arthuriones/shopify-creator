"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Store, Package, Sparkles, Settings2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/stores", label: "Lojas", icon: Store },
  { href: "/products", label: "Produtos", icon: Package },
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
    <aside
      className="flex h-screen w-56 flex-col border-r border-border/50"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.11 0.008 260), oklch(0.08 0.004 260))",
      }}
    >
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: "oklch(0.72 0.19 155)" }}
        >
          <Package className="h-3.5 w-3.5" style={{ color: "oklch(0.13 0.02 155)" }} />
        </div>
        <span
          className="text-sm font-semibold tracking-tight text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          Shopify Creator
        </span>
      </div>

      <nav className="flex-1 px-3 pt-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full animate-fade-in"
                  style={{ background: "oklch(0.72 0.19 155)" }}
                />
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 transition-colors duration-200",
                  isActive
                    ? "text-[oklch(0.72_0.19_155)]"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
                style={isActive ? { color: "oklch(0.72 0.19 155)" } : undefined}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/50 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-accent/50"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
