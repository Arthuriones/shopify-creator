import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRO_INCLUDED_CREDITS } from "@/lib/billing/plans";

export const runtime = "nodejs";

// GET -> plano, creditos e uso do mes do usuario logado (para a UI de billing).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "plan, subscription_status, ai_credits, current_period_end, credits_reset_at"
    )
    .eq("id", user.id)
    .single();

  // Uso do mes corrente (custo estimado + creditos consumidos).
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data: usage } = await supabase
    .from("ai_usage_log")
    .select("cost_usd, credits_used, action")
    .eq("user_id", user.id)
    .gte("created_at", startOfMonth.toISOString());

  const summary = (usage || []).reduce(
    (acc, row) => {
      acc.costUsd += Number(row.cost_usd || 0);
      acc.creditsUsed += Number(row.credits_used || 0);
      return acc;
    },
    { costUsd: 0, creditsUsed: 0 }
  );

  return NextResponse.json({
    email: user.email,
    plan: profile?.plan || "free",
    subscriptionStatus: profile?.subscription_status || null,
    aiCredits: profile?.ai_credits ?? 0,
    includedCredits: PRO_INCLUDED_CREDITS,
    currentPeriodEnd: profile?.current_period_end || null,
    usageThisMonth: {
      costUsd: Number(summary.costUsd.toFixed(4)),
      creditsUsed: summary.creditsUsed,
    },
  });
}
