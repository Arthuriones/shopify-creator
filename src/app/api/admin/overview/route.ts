import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_PRICE_USD } from "@/lib/billing/plans";

export const runtime = "nodejs";

// GET -> visao geral para o admin: usuarios, lojas, uso/custo de IA, MRR.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [{ data: profiles }, { data: stores }, { data: usage }, usersList] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, plan, subscription_status, ai_credits, current_period_end, created_at, access_granted, is_admin"
        ),
      admin.from("stores").select("id, user_id, shop_domain, name"),
      admin
        .from("ai_usage_log")
        .select("user_id, cost_usd, credits_used, action")
        .gte("created_at", startOfMonth.toISOString()),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  // email por id
  const emailById = new Map<string, string>();
  for (const u of usersList?.data?.users || []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  // lojas por usuario
  const storesByUser = new Map<string, { domain: string; name: string }[]>();
  for (const s of stores || []) {
    const list = storesByUser.get(s.user_id) || [];
    list.push({ domain: s.shop_domain, name: s.name || s.shop_domain });
    storesByUser.set(s.user_id, list);
  }

  // uso (custo + creditos) por usuario neste mes
  const usageByUser = new Map<string, { costUsd: number; credits: number }>();
  let totalCostUsd = 0;
  for (const row of usage || []) {
    const agg = usageByUser.get(row.user_id) || { costUsd: 0, credits: 0 };
    agg.costUsd += Number(row.cost_usd || 0);
    agg.credits += Number(row.credits_used || 0);
    usageByUser.set(row.user_id, agg);
    totalCostUsd += Number(row.cost_usd || 0);
  }

  const users = (profiles || [])
    .map((p) => {
      const usageAgg = usageByUser.get(p.id) || { costUsd: 0, credits: 0 };
      const hasAccess =
        p.is_admin === true || p.plan === "pro" || p.access_granted === true;
      return {
        id: p.id,
        email: emailById.get(p.id) || "—",
        plan: p.plan,
        subscriptionStatus: p.subscription_status,
        aiCredits: p.ai_credits,
        accessGranted: p.access_granted === true,
        isAdmin: p.is_admin === true,
        hasAccess,
        stores: storesByUser.get(p.id) || [],
        usageThisMonth: {
          costUsd: Number(usageAgg.costUsd.toFixed(4)),
          credits: usageAgg.credits,
        },
        createdAt: p.created_at,
      };
    })
    .sort((a, b) => b.usageThisMonth.costUsd - a.usageThisMonth.costUsd);

  const proUsers = users.filter((u) => u.plan === "pro").length;
  const withAccess = users.filter((u) => u.hasAccess).length;

  return NextResponse.json({
    summary: {
      totalUsers: users.length,
      proUsers,
      withAccess,
      mrrBrl: proUsers * PRO_PRICE_USD,
      aiCostThisMonthUsd: Number(totalCostUsd.toFixed(2)),
      totalStores: stores?.length || 0,
    },
    users,
  });
}
