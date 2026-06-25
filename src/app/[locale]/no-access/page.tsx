"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function NoAccessPage() {
  const t = useTranslations("noAccess");
  const [busy, setBusy] = useState<string | null>(null);

  async function subscribe() {
    setBusy("checkout");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Falha.");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar assinatura.");
      setBusy(null);
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("body")}</p>
        <Button className="mt-6 w-full" onClick={subscribe} disabled={busy === "checkout"}>
          {busy === "checkout" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {t("subscribe")}
        </Button>
        <button
          onClick={logout}
          className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
