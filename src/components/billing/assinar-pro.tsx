"use client";

import { useState } from "react";
import { CreditCard, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PagouCardForm } from "@/components/billing/pagou-card-form";
import { PixDialog, type CobrancaPix } from "@/components/billing/pix-dialog";
import { PRO_PRICE_CENTS } from "@/lib/billing/plans";

// ============================================================================
// Assinar o Pro. Usado na tela de billing e no paywall.
//
// Dois caminhos, porque a Pagou nao tem um so que sirva para todo mundo:
//  - Cartao: assinatura de verdade, renova sozinha.
//  - Pix: cobranca avulsa que libera 30 dias. Nao renova — a Pagou so faz
//    recorrencia por cartao (pix_automatic vem UNSUPPORTED nesta conta).
// ============================================================================

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mascaraDoc(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function AssinarPro({ onPronto }: { onPronto: () => void }) {
  const [via, setVia] = useState<"cartao" | "pix" | null>(null);
  const [cpf, setCpf] = useState("");
  const [pedirCpf, setPedirCpf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<CobrancaPix | null>(null);

  async function gerarPix() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId: "pro_month",
          ...(cpf.trim() ? { document: cpf } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsDocument) {
          setPedirCpf(true);
          toast.error(data.error);
          return;
        }
        throw new Error(data.error || "Falha ao gerar cobrança.");
      }
      setPedirCpf(false);
      setPix({
        transactionId: data.transactionId,
        credits: data.credits,
        amountCents: data.amountCents,
        kind: "pro_month",
        pix: data.pix,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar cobrança.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-background/45 p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Plano Pro
        </p>
        <p className="mt-1 text-3xl font-semibold text-foreground">
          {brl(PRO_PRICE_CENTS)}
          <span className="text-sm font-normal text-muted-foreground">/mês</span>
        </p>
      </div>

      {!via && (
        <div className="grid gap-2">
          <Button className="w-full justify-start" onClick={() => setVia("cartao")}>
            <CreditCard className="h-4 w-4" />
            <span className="flex-1 text-left">Cartão de crédito</span>
            <span className="flex items-center gap-1 text-[11px] opacity-80">
              <RefreshCw className="h-3 w-3" /> renova sozinho
            </span>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setVia("pix")}
          >
            <QrCode className="h-4 w-4" />
            <span className="flex-1 text-left">Pix</span>
            <span className="text-[11px] text-muted-foreground">30 dias</span>
          </Button>
        </div>
      )}

      {via === "cartao" && (
        <div className="space-y-3">
          <PagouCardForm
            labelBotao="Assinar agora"
            onSuccess={() => {
              toast.success("Assinatura confirmada!");
              onPronto();
            }}
          />
          <button
            onClick={() => setVia(null)}
            className="w-full text-xs text-muted-foreground underline hover:text-foreground"
          >
            Escolher outra forma
          </button>
        </div>
      )}

      {via === "pix" && (
        <div className="space-y-3">
          {pedirCpf && (
            <input
              autoFocus
              inputMode="numeric"
              placeholder="CPF do pagador"
              value={mascaraDoc(cpf)}
              onChange={(e) => setCpf(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && gerarPix()}
              className="w-full rounded-lg border border-border/60 bg-background/45 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          )}
          <Button className="w-full" onClick={gerarPix} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Gerar código Pix
          </Button>
          <p className="text-[11px] text-muted-foreground">
            O Pix libera 30 dias de Pro na hora. Não renova sozinho — quando
            acabar, é só pagar de novo.
          </p>
          <button
            onClick={() => setVia(null)}
            className="w-full text-xs text-muted-foreground underline hover:text-foreground"
          >
            Escolher outra forma
          </button>
        </div>
      )}

      {pix && (
        <PixDialog
          cobranca={pix}
          onPago={onPronto}
          onFechar={() => {
            setPix(null);
            onPronto();
          }}
        />
      )}
    </div>
  );
}
