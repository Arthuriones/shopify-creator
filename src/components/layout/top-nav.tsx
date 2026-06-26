"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

export function TopNav() {
  const router = useRouter();
  const t = useTranslations("nav");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md md:left-[264px]">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t("logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
