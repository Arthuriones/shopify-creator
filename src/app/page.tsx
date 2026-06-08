import { redirect } from "next/navigation";

type HomePageProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const shop = firstParam(params.shop);
  const code = firstParam(params.code);
  const state = firstParam(params.state);
  const storeId = firstParam(params.store_id);
  const host = firstParam(params.host);
  const hmac = firstParam(params.hmac);
  const timestamp = firstParam(params.timestamp);

  if (shop || code || state || storeId || host || hmac || timestamp) {
    const authParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
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

  redirect("/dashboard");
}
