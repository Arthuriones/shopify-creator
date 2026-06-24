"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [manage, setManage] = useState<AdminUser | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/overview");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
    { label: "Assinantes Pro", value: s?.proUsers ?? 0 },
    { label: "MRR", value: `R$${s?.mrrBrl ?? 0}` },
    { label: "Custo IA (mês)", value: `US$${s?.aiCostThisMonthUsd ?? 0}` },
    { label: "Lojas", value: s?.totalStores ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Painel admin</h1>
        <p className="text-sm text-muted-foreground">
          Usuários, lojas, uso de IA e receita.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
          <CardTitle>Usuários</CardTitle>
          <CardDescription>Ordenados por custo de IA no mês.</CardDescription>
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
                  <th className="py-2 pr-3">Usados (mês)</th>
                  <th className="py-2 pr-3">Custo IA</th>
                  <th className="py-2 pr-3"></th>
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
                    <td className="py-2 pr-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setManage(u)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Gerenciar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ManageUserDialog
        user={manage}
        onClose={() => setManage(null)}
        onSaved={() => {
          setManage(null);
          load();
        }}
      />
    </div>
  );
}

function ManageUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState("free");
  const [credits, setCredits] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPlan(user.plan);
      setCredits(String(user.aiCredits));
    }
  }, [user]);

  async function patch(payload: object, label: string) {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha.");
      toast.success(label);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar usuário</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v || "free")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Créditos (definir saldo)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-32"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ addCredits: 20 }, "+20 créditos")}
                disabled={saving}
              >
                +20
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ addCredits: 100 }, "+100 créditos")}
                disabled={saving}
              >
                +100
              </Button>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={saving}
            onClick={() =>
              patch(
                { plan, aiCredits: Number(credits) || 0 },
                "Usuário atualizado"
              )
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
