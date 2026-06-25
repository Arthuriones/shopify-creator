import { defineRouting } from "next-intl/routing";

// PT e EN. PT e o padrao e fica SEM prefixo (/dashboard); EN ganha /en
// (/en/dashboard) — mantem os links atuais funcionando. A escolha do padrao
// por geo (gringo -> en, BR -> pt) e feita no proxy.ts.
export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  localePrefix: "as-needed",
  // Detecao automatica por Accept-Language fica off; o default vem do geo no
  // proxy (com override manual salvo em cookie pelo seletor de idioma).
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
