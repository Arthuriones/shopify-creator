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

interface Overview {
  summary: {
    totalUsers: number;
    proUsers: number;
    withAccess: number;
    newUsersThisMonth: number;
    mrrUsd: number;
    aiCostThisMonthUsd: number;
    totalStores: number;
  };
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
  const cards = [
    { label: "Total users", value: s?.totalUsers ?? 0 },
    { label: "With access", value: s?.withAccess ?? 0 },
    { label: "Pro subscribers", value: s?.proUsers ?? 0 },
    { label: "New this month", value: s?.newUsersThisMonth ?? 0, highlight: true },
    { label: "MRR", value: `$${s?.mrrUsd ?? 0}` },
    { label: "AI cost (month)", value: `$${s?.aiCostThisMonthUsd ?? 0}` },
    { label: "Stores", value: s?.totalStores ?? 0 },
  ];

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {cards.map((c) => (
          <Card key={c.label} className={c.highlight ? "border-primary/40" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${c.highlight ? "text-primary" : "text-foreground"}`}>
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
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
