"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const navLinks = [
    { href: "/dashboard", label: "Visão Geral" },
    { href: "/stores", label: "Lojas" },
    { href: "/products", label: "Produtos" },
    { href: "/clone/routed-checkout", label: "Routed Checkout" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 glass-panel flex items-center justify-between px-6 shadow-[0_4px_30px_rgba(0,0,0,0.03)] border-b border-white/20 dark:border-white/5">
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <Image 
            src="/logo.png" 
            alt="XCART.APP Logo" 
            width={32} 
            height={32} 
            className="rounded-lg object-contain transition-transform group-active:scale-95" 
          />
          <span className="font-heading font-black text-xl tracking-tight text-foreground">
            XCART<span className="text-primary-cyan">.APP</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href + '/'));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[13px] font-semibold transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-slate-50 rounded-md transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
