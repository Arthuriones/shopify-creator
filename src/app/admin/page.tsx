"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AdminUser {
  id: string;
  email: string;
  plan: string;
  hasAccess: boolean;
  createdAt: string | null;
  usageThisMonth: { costUsd: number; credits: number };
}

interface Purchase {
  email: string;
  credits: number;
  amountBrl: number;
  currency: string;
  createdAt: string;
}

interface Overview {
  summary: {
    totalUsers: number;
    proUsers: number;
    withAccess: number;
    newUsersThisMonth: number;
    mrrBrl: number;
    aiCostThisMonthUsd: number;
    totalStores: number;
    creditRevenueMonthBrl: number;
    creditRevenueTotalBrl: number;
    creditPurchasesTotal: number;
    grossMarginMonthBrl: number;
    payingUsers: number;
  };
  recentPurchases: Purchase[];
  revenueByMonth: { mes: string; creditoUsd: number; compras: number }[];
  users: AdminUser[];
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Falha.");
        setData(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const s = data?.summary;
  const margem = s?.grossMarginMonthBrl ?? 0;

  // Separado em dois blocos: dinheiro primeiro, base depois. Antes eram sete
  // cards na mesma fileira misturando receita, custo e contagem de usuario —
  // dava para olhar e nao saber se o mes tinha sido bom.
  const cardsDinheiro = [
    { label: "MRR (assinaturas)", value: `R$ ${(s?.mrrBrl ?? 0).toFixed(2)}` },
    { label: "Créditos (mês)", value: `R$ ${(s?.creditRevenueMonthBrl ?? 0).toFixed(2)}` },
    {
      label: "Receita do mês",
      value: `R$ ${((s?.mrrBrl ?? 0) + (s?.creditRevenueMonthBrl ?? 0)).toFixed(2)}`,
      highlight: true,
    },
    { label: "Custo de IA (mês)", value: `-US$ ${(s?.aiCostThisMonthUsd ?? 0).toFixed(2)}` },
    {
      label: "Margem do mês",
      value: `${margem < 0 ? "-" : ""}R$ ${Math.abs(margem).toFixed(2)}`,
      tone: margem < 0 ? "ruim" : "bom",
    },
  ];

  const cardsBase = [
    { label: "Usuários", value: s?.totalUsers ?? 0 },
    { label: "Pagantes", value: s?.payingUsers ?? 0 },
    { label: "Pro ativos", value: s?.proUsers ?? 0 },
    { label: "Com acesso", value: s?.withAccess ?? 0 },
    { label: "Novos no mês", value: s?.newUsersThisMonth ?? 0 },
    { label: "Lojas", value: s?.totalStores ?? 0 },
  ];

  const compras = data?.recentPurchases ?? [];
  const porMes = data?.revenueByMonth ?? [];
  const maxMes = Math.max(1, ...porMes.map((m) => m.creditoUsd));

  const topUsers = (data?.users || [])
    .filter((u) => u.usageThisMonth.costUsd > 0)
    .slice(0, 10);

  const recentUsers = (data?.users || [])
    .filter((u) => u.createdAt)
    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Users, revenue and AI cost metrics.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dinheiro</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cardsDinheiro.map((c) => (
            <Card key={c.label} className={c.highlight ? "border-primary/40" : ""}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p
                  className={`mt-1 text-2xl font-semibold ${
                    c.tone === "ruim"
                      ? "text-destructive"
                      : c.tone === "bom"
                        ? "text-emerald-500"
                        : c.highlight
                          ? "text-primary"
                          : "text-foreground"
                  }`}
                >
                  {c.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base</p>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {cardsBase.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendas de crédito</CardTitle>
            <CardDescription>
              {s?.creditPurchasesTotal ?? 0} compras, R$ ${(s?.creditRevenueTotalBrl ?? 0).toFixed(2)} no total
            </CardDescription>
          </CardHeader>
          <CardContent>
            {compras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma compra de crédito ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Quem</th>
                    <th className="py-2 pr-3">Créditos</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c, i) => (
                    <tr key={`${c.email}-${c.createdAt}-${i}`} className="border-b border-border/40">
                      <td className="py-2 pr-3 text-foreground">{c.email}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.credits}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">
                        R$ ${c.amountBrl.toFixed(2)}
                      </td>
                      <td className="py-2 text-muted-foreground">{fmt(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita de crédito por mês</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {porMes.map((m) => (
              <div key={m.mes} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{m.mes}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted/40">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${Math.max(m.creditoUsd > 0 ? 4 : 0, (m.creditoUsd / maxMes) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-foreground">
                  ${m.creditoUsd.toFixed(2)}
                  <span className="ml-1 text-muted-foreground">({m.compras})</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top AI consumers */}
        <Card>
          <CardHeader>
            <CardTitle>Top AI consumers (month)</CardTitle>
            <CardDescription>
              <Link href="/admin/users" className="underline">
                View and manage all users
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI usage recorded this month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Credits</th>
                    <th className="py-2 pr-3">AI cost</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border/40">
                      <td className="py-2 pr-3 text-foreground">
                        <Link href={`/admin/users/${u.id}`} className="hover:underline">
                          {u.email}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{u.plan}</td>
                      <td className="py-2 pr-3 text-foreground">{u.usageThisMonth.credits}</td>
                      <td className="py-2 pr-3 text-foreground">
                        ${u.usageThisMonth.costUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Recent signups */}
        <Card>
          <CardHeader>
            <CardTitle>Recent signups</CardTitle>
            <CardDescription>Latest accounts created</CardDescription>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border/40">
                      <td className="py-2 pr-3 text-foreground">
                        <Link href={`/admin/users/${u.id}`} className="hover:underline">
                          {u.email}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{u.plan}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{fmt(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
