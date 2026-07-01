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
  byMonth: { month: string; revenueUsd: number; newUsers: number }[];
  revenue: { mrrUsd: number; creditSalesThisMonthUsd: number; revenueThisMonthUsd: number };
  cost: { thisMonthUsd: number };
  marginUsd: number;
}

const ACTION_LABEL: Record<string, string> = {
  neutralize_image: "Image neutralization",
  neutralize_text: "Text neutralization",
  translate: "Translation",
  clone: "Cloning",
  optimize: "Optimization",
  other: "Other",
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
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
  const maxAction = Math.max(...(data?.byAction.map((a) => a.costUsd) || [0]), 0.0001);
  const maxMonthRevenue = Math.max(...(data?.byMonth.map((m) => m.revenueUsd) || [0]), 0.0001);
  const margin = data?.marginUsd ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Usage & Costs</h1>
        <p className="text-sm text-muted-foreground">
          AI cost (last 30 days) and monthly revenue.
        </p>
      </div>

      {/* Revenue vs cost */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Revenue (month)</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              ${data?.revenue.revenueThisMonthUsd.toFixed(2)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              MRR ${data?.revenue.mrrUsd} + credits ${data?.revenue.creditSalesThisMonthUsd.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">AI cost (month)</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              ${data?.cost.thisMonthUsd.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Margin (month)</p>
            <p className={`mt-1 text-2xl font-semibold ${margin >= 0 ? "text-primary" : "text-destructive"}`}>
              ${margin.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Images neutralized</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {data?.byAction.find((a) => a.action === "neutralize_image")?.count ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly revenue + signups (last 6 months) */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by month (USD)</CardTitle>
          <CardDescription>Last 6 months — MRR + credit top-ups + new signups</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-2">
            {data?.byMonth.map((m) => (
              <div key={m.month} className="group relative flex flex-1 flex-col items-center gap-1">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(4, (m.revenueUsd / maxMonthRevenue) * 130)}px` }}
                    title={`${m.month}: $${m.revenueUsd}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                {m.newUsers > 0 && (
                  <span className="text-[9px] text-primary font-medium">+{m.newUsers}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>bar height = revenue · green number = new users</span>
          </div>
        </CardContent>
      </Card>

      {/* AI cost per day */}
      <Card>
        <CardHeader>
          <CardTitle>AI cost per day (USD)</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1">
            {data?.byDay.map((d) => (
              <div
                key={d.date}
                className="group relative flex-1"
                title={`${d.date}: $${d.costUsd.toFixed(3)}`}
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

      {/* Cost by action type */}
      <Card>
        <CardHeader>
          <CardTitle>Cost by action type (USD)</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.byAction.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded.</p>
          ) : (
            data?.byAction.map((a) => (
              <div key={a.action} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">
                    {ACTION_LABEL[a.action] || a.action}
                  </span>
                  <span className="text-muted-foreground">
                    {a.count}× · ${a.costUsd.toFixed(2)}
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
