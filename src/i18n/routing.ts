import { defineRouting } from "next-intl/routing";

// PT, EN e JA. PT e o padrao e fica SEM prefixo (/dashboard); EN ganha /en
// e JA ganha /ja (/en/dashboard, /ja/dashboard) — mantem os links atuais
// funcionando. A escolha do padrao por geo (gringo -> en, BR -> pt) e feita
// no proxy.ts; JA e escolhido manualmente pelo seletor de idioma.
export const routing = defineRouting({
  locales: ["pt", "en", "ja"],
  defaultLocale: "pt",
  localePrefix: "as-needed",
  // Detecao automatica por Accept-Language fica off; o default vem do geo no
  // proxy (com override manual salvo em cookie pelo seletor de idioma).
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
