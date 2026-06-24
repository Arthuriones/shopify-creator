import { createAdminClient } from "@/lib/supabase/admin";

// Custos estimados de IA (USD). Fonte: Gemini 2.5 Flash ($0.30/$2.50 por 1M
// tokens) e Gemini 2.5 Flash Image (~$0.039/imagem). Usados para medir a
// margem real por cliente em ai_usage_log.
export const AI_COST = {
  // 1 imagem neutralizada (Nano Banana).
  image: 0.039,
  // 1 chamada de texto (neutralizar/traduzir 1 produto): ~3.3k tokens.
  text: 0.003,
} as const;

export type AiAction =
  | "neutralize_image"
  | "neutralize_text"
  | "translate"
  | "clone"
  | "optimize"
  | "other";

interface LogAiUsageInput {
  userId: string;
  action: AiAction;
  costUsd: number;
  // Creditos que ESSA acao consome (1 para imagem neutralizada; 0 p/ gratuitas).
  // Em Fase 2 (medicao) so registramos; o debito/gating vem depois.
  creditsUsed?: number;
  storeId?: string | null;
  metadata?: Record<string, unknown>;
}

// Registra uma acao de IA com seu custo. Resiliente: nunca lanca para nao
// quebrar o fluxo de IA (a medicao e best-effort).
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  if (!input.userId) return;
  try {
    const supabase = createAdminClient();
    await supabase.from("ai_usage_log").insert({
      user_id: input.userId,
      store_id: input.storeId || null,
      action: input.action,
      cost_usd: Number(input.costUsd.toFixed(5)),
      credits_used: input.creditsUsed ?? 0,
      metadata: input.metadata || {},
    });
  } catch (error) {
    console.warn(
      "[billing/usage] falha ao registrar uso de IA:",
      error instanceof Error ? error.message : error
    );
  }
}
