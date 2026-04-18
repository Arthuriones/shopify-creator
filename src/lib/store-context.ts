import { createClient } from "@/lib/supabase/server";
import type { StoreContext } from "@/types";

export async function getStoreContext(storeId: string, userId: string): Promise<StoreContext | null> {
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("name, niche, target_audience, brand_voice, store_description")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  if (!store || !store.niche) return null;

  return {
    name: store.name,
    niche: store.niche,
    targetAudience: store.target_audience || "",
    brandVoice: store.brand_voice || "",
    storeDescription: store.store_description || "",
  };
}
