"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Analytics {
  byAction: { action: string; costUsd: number; count: number; credits: number }[];
  byDay: { date: string; costUsd: number }[];
  revenue: { mrrBrl: number; creditSalesBrl: number; revenueThisMonthBrl: number };
  cost: { thisMonthUsd: number; thisMonthBrl: number };
  marginBrl: number;
}

const ACTION_LABEL: Record<string, string> = {
  neutralize_image: "Imagem (neutralizar)",
  neutralize_text: "Texto (neutralizar)",
  translate: "Tradução",
  clone: "Clonagem",
  optimize: "Otimização",
  other: "Outros",
};

export default function AdminUsagePage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
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

  const maxDay = Math.max(...(data?.byDay.map((d) => d.costUsd) || [0]), 0.0001);
  const maxAction = Math.max(
    ...(data?.byAction.map((a) => a.costUsd) || [0]),
    0.0001
  );
  const margin = data?.marginBrl ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Uso & Custos</h1>
        <p className="text-sm text-muted-foreground">
          Custo de IA dos últimos 30 dias e receita do mês.
        </p>
      </div>

      {/* Receita vs custo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Receita (mês)</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              R${data?.revenue.revenueThisMonthBrl.toFixed(2)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              MRR R${data?.revenue.mrrBrl} + recargas R$
              {data?.revenue.creditSalesBrl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Custo IA (mês)</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              R${data?.cost.thisMonthBrl.toFixed(2)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              US${data?.cost.thisMonthUsd.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Margem (mês)</p>
            <p
              className={
                "mt-1 text-2xl font-semibold " +
                (margin >= 0 ? "text-primary" : "text-destructive")
              }
            >
              R${margin.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Imagens neutralizadas</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {data?.byAction.find((a) => a.action === "neutralize_image")?.count ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">últimos 30 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Custo por dia */}
      <Card>
        <CardHeader>
          <CardTitle>Custo de IA por dia (US$)</CardTitle>
          <CardDescription>Últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1">
            {data?.byDay.map((d) => (
              <div
                key={d.date}
                className="group relative flex-1"
                title={`${d.date}: US$${d.costUsd.toFixed(3)}`}
              >
                <div
                  className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                  style={{ height: `${Math.max(2, (d.costUsd / maxDay) * 150)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{data?.byDay[0]?.date}</span>
            <span>{data?.byDay[data.byDay.length - 1]?.date}</span>
          </div>
        </CardContent>
      </Card>

      {/* Custo por tipo de ação */}
      <Card>
        <CardHeader>
          <CardTitle>Custo por tipo de ação (US$)</CardTitle>
          <CardDescription>Últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.byAction.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sem uso registrado.</p>
          ) : (
            data?.byAction.map((a) => (
              <div key={a.action} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">
                    {ACTION_LABEL[a.action] || a.action}
                  </span>
                  <span className="text-muted-foreground">
                    {a.count}× · US${a.costUsd.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(a.costUsd / maxAction) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
