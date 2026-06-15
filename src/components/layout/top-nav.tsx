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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="grid h-[72px] grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex items-center border-r border-border px-5">
          <Link href="/dashboard" className="group flex items-center">
            <div className="relative h-12 w-[176px] overflow-hidden rounded-lg bg-accent">
              <Image
                src="/logo.png"
                alt="XCART.APP Logo"
                fill
                className="object-cover object-left"
                priority
              />
            </div>
          </Link>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-4 px-5 lg:px-7">
          <nav className="hidden min-w-0 items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
