import { createAdminClient } from "@/lib/supabase/admin";

// Trava de acesso. Enquanto false (default), todo mundo entra (comportamento
// atual). Ligar so depois de liberar os usuarios certos no painel admin.
export function accessControlEnabled(): boolean {
  return process.env.ACCESS_CONTROL_ENABLED === "true";
}

interface AccessProfile {
  is_admin?: boolean | null;
  plan?: string | null;
  access_granted?: boolean | null;
  free_clone_store_id?: string | null;
}

// Acesso total: admin OU plano pro OU liberado manualmente. Sem limites.
export function profileHasAccess(profile: AccessProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.is_admin === true ||
    profile.plan === "pro" ||
    profile.access_granted === true
  );
}

// Pode ENTRAR no app: tem acesso total, OU ainda nao usou a clonagem gratuita
// do trial (free_clone_store_id == null). Depois do trial, sem assinar, bloqueia.
export function profileCanEnter(profile: AccessProfile | null): boolean {
  if (!profile) return false;
  if (profileHasAccess(profile)) return true;
  return !profile.free_clone_store_id; // trial ainda disponivel
}

// Checa se um usuario pode entrar no app (server-side). Com o controle
// desligado, sempre true (comportamento atual).
export async function userHasAccess(userId: string): Promise<boolean> {
  if (!accessControlEnabled()) return true;
  if (!userId) return false;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, plan, access_granted, free_clone_store_id")
    .eq("id", userId)
    .single();
  return profileCanEnter(data);
}

export interface ClonePermission {
  allowed: boolean;
  reason?: "subscribe";
}

// Trava da clonagem: com acesso total, libera. Sem assinar, libera 1 loja
// (consome o trial) e qualquer reclonagem da MESMA loja; outra loja bloqueia.
export async function checkAndConsumeFreeClone(
  userId: string,
  targetStoreId: string
): Promise<ClonePermission> {
  if (!accessControlEnabled()) return { allowed: true };
  if (!userId || !targetStoreId) return { allowed: true };

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, plan, access_granted, free_clone_store_id")
    .eq("id", userId)
    .single();

  if (profileHasAccess(profile)) return { allowed: true };

  const usedStore = profile?.free_clone_store_id || null;

  // Ja usou o trial em outra loja -> precisa assinar.
  if (usedStore && usedStore !== targetStoreId) {
    return { allowed: false, reason: "subscribe" };
  }

  // Trial ainda disponivel: consome (atomico, so seta se ainda null).
  if (!usedStore) {
    await supabase
      .from("profiles")
      .update({
        free_clone_store_id: targetStoreId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .is("free_clone_store_id", null);
  }

  return { allowed: true };
}
