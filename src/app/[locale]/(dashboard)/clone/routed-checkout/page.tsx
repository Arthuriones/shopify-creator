"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPublicAppUrl } from "@/lib/public-url";
import { RoutingConsole } from "@/components/routed-checkout/routing-console";
import { ConnectStoresWizard } from "@/components/routed-checkout/connect-stores-wizard";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche?: string | null;
  target_language?: string | null;
}

export default function RoutedCheckoutPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();
    supabase
      .from("stores")
      .select("id, name, shop_domain, niche, target_language")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelado && data) setStores(data as StoreOption[]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <>
      <RoutingConsole
        key={reloadKey}
        onConnectStores={() => setWizardOpen(true)}
      />
      <ConnectStoresWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        stores={stores}
        appOrigin={getPublicAppUrl(process.env.NEXT_PUBLIC_APP_URL || "")}
        onRouteCreated={() => setReloadKey((key) => key + 1)}
      />
    </>
  );
}
