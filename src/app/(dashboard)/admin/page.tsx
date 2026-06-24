"use client";

import { useEffect, useState } from "react";
import { Loader2, Store as StoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  subscriptionStatus: string | null;
  aiCredits: number;
  stores: { domain: string; name: string }[];
  usageThisMonth: { costUsd: number; credits: number };
  createdAt: string;
}

interface Overview {
  summary: {
    totalUsers: number;
    proUsers: number;
    mrrBrl: number;
    aiCostThisMonthUsd: number;
    totalStores: number;
  };
  users: AdminUser[];
}

export default function AdminPage() {
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
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const s = data?.summary;
  const cards = [
    { label: "Usuários", value: s?.totalUsers ?? 0 },
    { label: "Assinantes Pro", value: s?.proUsers ?? 0 },
    { label: "MRR", value: `R$${s?.mrrBrl ?? 0}` },
    { label: "Custo IA (mês)", value: `US$${s?.aiCostThisMonthUsd ?? 0}` },
    { label: "Lojas conectadas", value: s?.totalStores ?? 0 },
  ];

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Usuários, lojas, uso de IA e receita.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>
            Ordenados por custo de IA no mês (maior primeiro).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Plano</th>
                  <th className="py-2 pr-3">Créditos</th>
                  <th className="py-2 pr-3">Lojas</th>
                  <th className="py-2 pr-3">Créditos usados (mês)</th>
                  <th className="py-2 pr-3">Custo IA (mês)</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id} className="border-b border-border/40 align-top">
                    <td className="py-2 pr-3 text-foreground">{u.email}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={u.plan === "pro" ? "default" : "secondary"}
                        className="rounded-md"
                      >
                        {u.plan}
                        {u.subscriptionStatus ? ` · ${u.subscriptionStatus}` : ""}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-foreground">{u.aiCredits}</td>
                    <td className="py-2 pr-3">
                      {u.stores.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {u.stores.slice(0, 4).map((store) => (
                            <span
                              key={store.domain}
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                            >
                              <StoreIcon className="h-3 w-3" />
                              {store.name}
                            </span>
                          ))}
                          {u.stores.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{u.stores.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
