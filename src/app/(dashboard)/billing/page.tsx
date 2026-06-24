"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Sparkles, Zap } from "lucide-react";
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

interface BillingInfo {
  email: string;
  plan: string;
  subscriptionStatus: string | null;
  aiCredits: number;
  includedCredits: number;
  currentPeriodEnd: string | null;
  usageThisMonth: { costUsd: number; creditsUsed: number };
}

interface Pack {
  id: string;
  credits: number;
  amountCents: number;
  label: string;
}

function BillingInner() {
  const params = useSearchParams();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const status = params.get("status");
    if (status === "success") toast.success("Assinatura ativada!");
    if (status === "credits_success") toast.success("Créditos adicionados!");
    if (status === "cancel") toast("Pagamento cancelado.");
  }, [params]);

  async function load() {
    try {
      const [meRes, packsRes] = await Promise.all([
        fetch("/api/billing/me"),
        fetch("/api/billing/credits"),
      ]);
      const me = await meRes.json();
      const pk = await packsRes.json();
      if (meRes.ok) setInfo(me);
      if (packsRes.ok) setPacks(pk.packs || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function redirectTo(url: string, key: string, body?: object) {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Falha.");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha.");
      setBusy(null);
    }
  }

  const isPro = info?.plan === "pro";
  const reais = (cents: number) => (cents / 100).toFixed(0);

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Assinatura e créditos</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu plano e recarregue créditos de IA.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Plano atual */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Plano {isPro ? "Pro" : "Free"}
                    <Badge variant={isPro ? "default" : "secondary"} className="rounded-md">
                      {isPro ? info?.subscriptionStatus || "ativo" : "sem assinatura"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {isPro
                      ? "Clonagem ilimitada, tradução e créditos de neutralização."
                      : "Assine o Pro para liberar tudo (R$89/mês)."}
                  </CardDescription>
                </div>
                {isPro ? (
                  <Button
                    variant="outline"
                    onClick={() => redirectTo("/api/billing/portal", "portal")}
                    disabled={busy === "portal"}
                  >
                    {busy === "portal" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Gerenciar
                  </Button>
                ) : (
                  <Button
                    onClick={() => redirectTo("/api/billing/checkout", "checkout")}
                    disabled={busy === "checkout"}
                  >
                    {busy === "checkout" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Assinar Pro — R$89/mês
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-primary" /> Créditos de IA
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {info?.aiCredits ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Usados este mês</div>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {info?.usageThisMonth.creditsUsed ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Custo IA estimado (mês)</div>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    US${info?.usageThisMonth.costUsd?.toFixed(2) ?? "0.00"}
                  </p>
                </div>
              </div>
              {info?.currentPeriodEnd && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Renova em {new Date(info.currentPeriodEnd).toLocaleDateString("pt-BR")}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recarga de créditos */}
          <Card>
            <CardHeader>
              <CardTitle>Recarregar créditos</CardTitle>
              <CardDescription>
                1 crédito = 1 produto neutralizado com foto. Compra avulsa, não expira.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/45 p-4"
                  >
                    <p className="text-lg font-semibold text-foreground">
                      {pack.credits} créditos
                    </p>
                    <p className="text-sm text-muted-foreground">
                      R${reais(pack.amountCents)}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-1"
                      onClick={() =>
                        redirectTo("/api/billing/credits", pack.id, { packId: pack.id })
                      }
                      disabled={busy === pack.id}
                    >
                      {busy === pack.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Comprar
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingInner />
    </Suspense>
  );
}
