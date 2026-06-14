"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function TopNav() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-border flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex items-center justify-center bg-brand-gradient text-white font-bold h-8 w-8 rounded-lg shadow-sm">
            X
          </div>
          <span className="font-heading font-black text-xl tracking-tight text-foreground">
            XCART<span className="text-primary-cyan">.APP</span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
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
