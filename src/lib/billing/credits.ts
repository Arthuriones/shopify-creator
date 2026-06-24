import { createAdminClient } from "@/lib/supabase/admin";

// Enforcement do gating. Enquanto false (default), o sistema apenas MEDE o uso
// (Fase 2) sem bloquear ninguem. Ligar so quando a cobranca estiver no ar,
// senao os usuarios atuais (plano free, 0 creditos) ficam bloqueados.
export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true";
}

// Debita N creditos do usuario de forma atomica. Quando o enforcement esta
// desligado, sempre permite (e nao debita). Retorna se a acao pode prosseguir.
export async function consumeCredits(
  userId: string,
  amount = 1
): Promise<{ ok: boolean; enforced: boolean }> {
  if (!billingEnforced()) return { ok: true, enforced: false };
  if (!userId) return { ok: false, enforced: true };
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("consume_ai_credits", {
      p_user_id: userId,
      p_amount: amount,
    });
    if (error) {
      console.warn("[billing/credits] consume erro:", error.message);
      return { ok: false, enforced: true };
    }
    return { ok: data === true, enforced: true };
  } catch (error) {
    console.warn(
      "[billing/credits] consume excecao:",
      error instanceof Error ? error.message : error
    );
    return { ok: false, enforced: true };
  }
}

// Devolve N creditos (ex.: a neutralizacao falhou apos debitar). So faz algo
// quando o enforcement esta ligado (caso contrario nada foi debitado).
export async function refundCredits(userId: string, amount = 1): Promise<void> {
  if (!billingEnforced() || !userId) return;
  try {
    const supabase = createAdminClient();
    await supabase.rpc("add_ai_credits", {
      p_user_id: userId,
      p_amount: amount,
    });
  } catch (error) {
    console.warn(
      "[billing/credits] refund erro:",
      error instanceof Error ? error.message : error
    );
  }
}

// Saldo atual de creditos do usuario.
export async function getCreditBalance(userId: string): Promise<number> {
  if (!userId) return 0;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("ai_credits")
    .eq("id", userId)
    .single();
  return data?.ai_credits ?? 0;
}
