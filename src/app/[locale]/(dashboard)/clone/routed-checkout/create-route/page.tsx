import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// Endereco antigo de quando o roteamento estava espalhado em varias telas.
// Mantido so para link salvo nao dar 404.
export default async function LegacyRoutedCheckoutView() {
  redirect({ href: "/clone/routed-checkout", locale: await getLocale() });
}
