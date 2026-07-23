"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Rotaciona entre os idiomas (PT -> EN -> JA -> PT) mantendo a rota atual
// (o next-intl cuida do prefixo).
const LABELS: Record<string, string> = {
  pt: "Português",
  en: "English",
  ja: "日本語",
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const locales = routing.locales;
  const idx = locales.indexOf(locale as (typeof locales)[number]);
  const next = locales[(idx + 1) % locales.length];

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      title={`${LABELS[next] ?? next}`}
    >
      <Languages className="h-4 w-4" />
      <span className="uppercase">{locale}</span>
    </button>
  );
}
