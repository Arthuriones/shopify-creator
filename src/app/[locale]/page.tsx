import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Landing from "./lp/page";

type HomePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ params, searchParams }: HomePageProps) {
  const { locale } = await params;
  const host = (await headers()).get("host") || "";
  const isAppHost =
    host.startsWith("user.") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.endsWith(".vercel.app");

  // Host comercial (xcart.app / www): a raiz mostra a landing de vendas.
  if (!isAppHost) {
    return <Landing />;
  }

  // Host do app: trata callback de instalacao da Shopify ou vai pro dashboard.
  const sp = await searchParams;
  const shop = firstParam(sp.shop);
  const code = firstParam(sp.code);
  const state = firstParam(sp.state);
  const storeId = firstParam(sp.store_id);
  const hostParam = firstParam(sp.host);
  const hmac = firstParam(sp.hmac);
  const timestamp = firstParam(sp.timestamp);

  if (shop || code || state || storeId || hostParam || hmac || timestamp) {
    const authParams = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item) authParams.append(key, item);
        }
        continue;
      }
      if (value) authParams.set(key, value);
    }
    const query = authParams.toString();
    redirect(query ? `/api/shopify/auth?${query}` : "/api/shopify/auth");
  }

  const prefix = locale === "en" ? "/en" : "";
  redirect(`${prefix}/dashboard`);
}
