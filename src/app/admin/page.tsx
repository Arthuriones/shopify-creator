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
  usageThisMonth: { costUsd: number; credits: number };
}

interface Overview {
  summary: {
    totalUsers: number;
    proUsers: number;
    withAccess: number;
    mrrBrl: number;
    aiCostThisMonthUsd: number;
    totalStores: number;
  };
  users: AdminUser[];
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
  const cards = [
    { label: "Usuários", value: s?.totalUsers ?? 0 },
    { label: "Com acesso", value: s?.withAccess ?? 0 },
    { label: "Assinantes Pro", value: s?.proUsers ?? 0 },
    { label: "MRR", value: `R$${s?.mrrBrl ?? 0}` },
    { label: "Custo IA (mês)", value: `US$${s?.aiCostThisMonthUsd ?? 0}` },
    { label: "Lojas", value: s?.totalStores ?? 0 },
  ];

  const topUsers = (data?.users || [])
    .filter((u) => u.usageThisMonth.costUsd > 0)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Métricas de usuários, receita e custo de IA.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Maiores consumidores de IA (mês)</CardTitle>
          <CardDescription>
            <Link href="/admin/users" className="underline">
              Ver e gerenciar todos os usuários
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem consumo de IA registrado este mês ainda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Plano</th>
                  <th className="py-2 pr-3">Créditos usados</th>
                  <th className="py-2 pr-3">Custo IA</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 text-foreground">{u.email}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.plan}</td>
                    <td className="py-2 pr-3 text-foreground">
                      {u.usageThisMonth.credits}
                    </td>
                    <td className="py-2 pr-3 text-foreground">
                      US${u.usageThisMonth.costUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
