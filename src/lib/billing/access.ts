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
}

// Regra de acesso: admin OU plano pro OU liberado manualmente.
export function profileHasAccess(profile: AccessProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.is_admin === true ||
    profile.plan === "pro" ||
    profile.access_granted === true
  );
}

// Checa acesso de um usuario (server-side). Quando o controle esta desligado,
// sempre retorna true.
export async function userHasAccess(userId: string): Promise<boolean> {
  if (!accessControlEnabled()) return true;
  if (!userId) return false;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, plan, access_granted")
    .eq("id", userId)
    .single();
  return profileHasAccess(data);
}
