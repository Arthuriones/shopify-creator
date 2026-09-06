"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./language-switcher";

// Onde cada rota aparece na trilha do topo. Chave de traducao do namespace nav.
const TRILHA: { prefixo: string; chave: string }[] = [
  { prefixo: "/setup", chave: "setup" },
  { prefixo: "/overview", chave: "overview" },
  { prefixo: "/stores", chave: "connectedStores" },
  { prefixo: "/clone/routed-checkout", chave: "routing" },
  { prefixo: "/clone/shopify", chave: "importProducts" },
  { prefixo: "/clone", chave: "importProducts" },
  { prefixo: "/products", chave: "products" },
  { prefixo: "/billing", chave: "billing" },
  { prefixo: "/claude", chave: "claude" },
];

export function TopNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // O prefixo mais longo ganha: /clone/routed-checkout antes de /clone.
  const atual = TRILHA.filter((item) => pathname.startsWith(item.prefixo)).sort(
    (a, b) => b.prefixo.length - a.prefixo.length
  )[0];

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-border bg-[var(--header-bg)] backdrop-blur-md md:left-[228px]">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        {atual && (
          <span className="text-[12.5px] font-medium text-ink">{t(atual.chave)}</span>
        )}
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
