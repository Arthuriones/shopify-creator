"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

// Alterna entre PT e EN mantendo a rota atual (o next-intl cuida do prefixo).
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const other = locale === "pt" ? "en" : "pt";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: other })}
      className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      title={other === "en" ? "Switch to English" : "Mudar para Português"}
    >
      <Languages className="h-4 w-4" />
      <span className="uppercase">{locale}</span>
    </button>
  );
}
