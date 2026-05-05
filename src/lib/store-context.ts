import { createClient } from "@/lib/supabase/server";
import type { StoreContext } from "@/types";

export async function getStoreContext(storeId: string, userId: string): Promise<StoreContext | null> {
  const supabase = await createClient();
  const { data: store, error } = await supabase
    .from("stores")
    .select("name, niche, target_audience, brand_voice, store_description, target_language")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  if (error) {
    const { data: fallbackStore } = await supabase
      .from("stores")
      .select("name, niche, target_audience, brand_voice, store_description")
      .eq("id", storeId)
      .eq("user_id", userId)
      .single();

    if (!fallbackStore || !fallbackStore.niche) return null;
    return {
      name: fallbackStore.name,
      niche: fallbackStore.niche,
      targetAudience: fallbackStore.target_audience || "",
      brandVoice: fallbackStore.brand_voice || "",
      storeDescription: fallbackStore.store_description || "",
      targetLanguage: "pt-BR",
    };
  }

  if (!store || !store.niche) return null;

  return {
    name: store.name,
    niche: store.niche,
    targetAudience: store.target_audience || "",
    brandVoice: store.brand_voice || "",
    storeDescription: store.store_description || "",
    targetLanguage: store.target_language || "pt-BR",
  };
}
