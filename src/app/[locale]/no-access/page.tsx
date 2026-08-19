"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PagouCardForm } from "@/components/billing/pagou-card-form";
import { PRO_PRICE_BRL } from "@/lib/billing/plans";

/**
 * Paywall. O layout do dashboard manda todo mundo sem acesso para ca, entao
 * NAO da para so linkar /billing: a rota esta atras da mesma trava e o usuario
 * voltaria para esta pagina em loop. O formulario de cartao mora aqui mesmo.
 *
 * Antes esta tela chamava /api/billing/checkout, que era o Checkout hospedado
 * do Stripe. A Pagou nao tem equivalente para assinatura, e a rota deixou de
 * existir na migracao — o botao batia em 404 e ninguem conseguia assinar.
 */
export default function NoAccessPage() {
  const t = useTranslations("noAccess");
  const [mostrarCartao, setMostrarCartao] = useState(false);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("body")}</p>
        </div>

        {mostrarCartao ? (
          <div className="mt-6 space-y-3">
            <div className="rounded-lg border border-border/60 bg-background/45 p-3 text-center">
              <p className="text-sm text-muted-foreground">Plano Pro</p>
              <p className="text-2xl font-semibold text-foreground">
                R$ {PRO_PRICE_BRL}
                <span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
            </div>
            <PagouCardForm
              labelBotao="Assinar agora"
              onSuccess={() => {
                toast.success("Assinatura confirmada!");
                // Recarrega para o layout reavaliar o acesso e liberar o app.
                setTimeout(() => window.location.replace("/dashboard"), 900);
              }}
            />
            <button
              onClick={() => setMostrarCartao(false)}
              className="w-full text-xs text-muted-foreground underline hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        ) : (
          <Button className="mt-6 w-full" onClick={() => setMostrarCartao(true)}>
            <Sparkles className="h-4 w-4" />
            {t("subscribe")}
          </Button>
        )}

        <button
          onClick={logout}
          className="mt-4 w-full text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
