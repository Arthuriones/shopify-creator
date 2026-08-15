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

  const [
    { data: profiles },
    { data: stores },
    { data: usage },
    { data: compras },
    usersList,
  ] = await Promise.all([
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
    // Receita de verdade: o MRR aqui era estimativa (assinantes x preco).
    // Pacote de credito e dinheiro que ja entrou, e nao aparecia em lugar nenhum.
    admin
      .from("credit_purchases")
      .select("user_id, credits, amount_cents, currency, created_at")
      .order("created_at", { ascending: false }),
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
  const newUsersThisMonth = users.filter(
    (u) => u.createdAt && new Date(u.createdAt) >= startOfMonth
  ).length;

  // --- receita de pacotes de credito -----------------------------------
  const todasCompras = compras || [];
  const noMes = todasCompras.filter((c) => new Date(c.created_at) >= startOfMonth);
  const soma = (lista: typeof todasCompras) =>
    lista.reduce((t, c) => t + Number(c.amount_cents || 0), 0) / 100;

  const creditoMesUsd = soma(noMes);
  const creditoTotalUsd = soma(todasCompras);
  const mrrUsd = proUsers * PRO_PRICE_USD;
  const custoMes = Number(totalCostUsd.toFixed(2));

  const recentPurchases = todasCompras.slice(0, 12).map((c) => ({
    email: emailById.get(c.user_id) || c.user_id.slice(0, 8),
    credits: c.credits,
    amountUsd: Number((Number(c.amount_cents || 0) / 100).toFixed(2)),
    currency: String(c.currency || "usd").toUpperCase(),
    createdAt: c.created_at,
  }));

  // Receita por mes, ultimos 6, para enxergar tendencia em vez de um numero solto.
  const porMes = new Map<string, { creditoUsd: number; compras: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(startOfMonth);
    d.setUTCMonth(d.getUTCMonth() - i);
    porMes.set(d.toISOString().slice(0, 7), { creditoUsd: 0, compras: 0 });
  }
  for (const c of todasCompras) {
    const k = String(c.created_at).slice(0, 7);
    const agg = porMes.get(k);
    if (!agg) continue;
    agg.creditoUsd += Number(c.amount_cents || 0) / 100;
    agg.compras += 1;
  }

  return NextResponse.json({
    summary: {
      totalUsers: users.length,
      proUsers,
      withAccess,
      newUsersThisMonth,
      mrrUsd,
      aiCostThisMonthUsd: custoMes,
      totalStores: stores?.length || 0,
      creditRevenueMonthUsd: Number(creditoMesUsd.toFixed(2)),
      creditRevenueTotalUsd: Number(creditoTotalUsd.toFixed(2)),
      creditPurchasesTotal: todasCompras.length,
      // O numero que responde "isso da lucro?": tudo que entra no mes menos o
      // que a Gemini custou no mes.
      grossMarginMonthUsd: Number((mrrUsd + creditoMesUsd - custoMes).toFixed(2)),
      payingUsers: new Set([
        ...users.filter((u) => u.plan === "pro").map((u) => u.id),
        ...todasCompras.map((c) => c.user_id),
      ]).size,
    },
    recentPurchases,
    revenueByMonth: [...porMes.entries()].map(([mes, v]) => ({
      mes,
      creditoUsd: Number(v.creditoUsd.toFixed(2)),
      compras: v.compras,
    })),
    users,
  });
}
