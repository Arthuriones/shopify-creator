import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_PRICE_USD } from "@/lib/billing/plans";

export const runtime = "nodejs";

// Cambio aproximado para estimar margem (custo IA em USD vs receita em BRL).
const USD_TO_BRL = 5.4;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const now = new Date();
  const since30 = new Date(now);
  since30.setUTCDate(since30.getUTCDate() - 29);
  since30.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(now);
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [{ data: usage30 }, { data: purchases }, { data: profiles }] =
    await Promise.all([
      admin
        .from("ai_usage_log")
        .select("created_at, cost_usd, credits_used, action")
        .gte("created_at", since30.toISOString()),
      admin
        .from("credit_purchases")
        .select("amount_cents, created_at")
        .gte("created_at", startOfMonth.toISOString()),
      admin.from("profiles").select("plan"),
    ]);

  // Por acao (30 dias)
  const byActionMap = new Map<string, { costUsd: number; count: number; credits: number }>();
  // Por dia (30 dias)
  const byDayMap = new Map<string, number>();
  let costThisMonthUsd = 0;
  for (const row of usage30 || []) {
    const a = byActionMap.get(row.action) || { costUsd: 0, count: 0, credits: 0 };
    a.costUsd += Number(row.cost_usd || 0);
    a.count += 1;
    a.credits += Number(row.credits_used || 0);
    byActionMap.set(row.action, a);

    const day = String(row.created_at).slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) || 0) + Number(row.cost_usd || 0));

    if (new Date(row.created_at) >= startOfMonth) {
      costThisMonthUsd += Number(row.cost_usd || 0);
    }
  }

  // Serie diaria continua (preenche dias sem uso com 0)
  const byDay: { date: string; costUsd: number }[] = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(since30);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.push({ date: key, costUsd: Number((byDayMap.get(key) || 0).toFixed(4)) });
  }

  const byAction = [...byActionMap.entries()]
    .map(([action, v]) => ({
      action,
      costUsd: Number(v.costUsd.toFixed(4)),
      count: v.count,
      credits: v.credits,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const proUsers = (profiles || []).filter((p) => p.plan === "pro").length;
  const mrrBrl = proUsers * PRO_PRICE_USD;
  const creditSalesBrl =
    (purchases || []).reduce((s, p) => s + Number(p.amount_cents || 0), 0) / 100;
  const revenueThisMonthBrl = mrrBrl + creditSalesBrl;
  const costThisMonthBrl = costThisMonthUsd * USD_TO_BRL;
  const marginBrl = revenueThisMonthBrl - costThisMonthBrl;

  return NextResponse.json({
    byAction,
    byDay,
    revenue: {
      mrrBrl,
      creditSalesBrl: Number(creditSalesBrl.toFixed(2)),
      revenueThisMonthBrl: Number(revenueThisMonthBrl.toFixed(2)),
    },
    cost: {
      thisMonthUsd: Number(costThisMonthUsd.toFixed(2)),
      thisMonthBrl: Number(costThisMonthBrl.toFixed(2)),
    },
    marginBrl: Number(marginBrl.toFixed(2)),
  });
}
