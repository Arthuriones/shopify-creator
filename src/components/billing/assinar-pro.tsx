"use client";

import { useState } from "react";
import { ArrowLeft, Check, CreditCard, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PagouCardForm } from "@/components/billing/pagou-card-form";
import { PixDialog, type CobrancaPix } from "@/components/billing/pix-dialog";
import { PRO_INCLUDED_CREDITS, PRO_PRICE_CENTS } from "@/lib/billing/plans";

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

const INCLUI = [
  "Clonagem ilimitada de lojas",
  `${PRO_INCLUDED_CREDITS} créditos de IA por mês`,
  "Tradução e neutralização automáticas",
];

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
    <div className="space-y-5">
      {/* Resumo do que esta sendo comprado. Fica visivel nos tres estados:
          quem chega no formulario de cartao nao deve precisar voltar para
          lembrar do preco. */}
      <div className="rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Plano Pro
          </span>
          <div className="text-right">
            <span className="text-2xl font-semibold text-foreground">
              {brl(PRO_PRICE_CENTS)}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
          {INCLUI.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {!via && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            Como você prefere pagar?
          </p>
          <button
            onClick={() => setVia("cartao")}
            className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-4 text-left transition hover:border-primary/60 hover:bg-background/70"
          >
            <CreditCard className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Cartão de crédito</p>
              <p className="text-xs text-muted-foreground">
                Renova automaticamente todo mês
              </p>
            </div>
          </button>
          <button
            onClick={() => setVia("pix")}
            className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-4 text-left transition hover:border-primary/60 hover:bg-background/70"
          >
            <QrCode className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Pix</p>
              <p className="text-xs text-muted-foreground">
                Libera 30 dias na hora — sem renovação automática
              </p>
            </div>
          </button>
        </div>
      )}

      {via && (
        <div className="space-y-4">
          <button
            onClick={() => setVia(null)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Trocar forma de pagamento
          </button>

          {via === "cartao" ? (
            <PagouCardForm
              // O botao diz o que acontece e quanto custa, em vez de um
              // "Assinar agora" que esconde o valor.
              labelBotao={`Assinar por ${brl(PRO_PRICE_CENTS)}/mês`}
              onSuccess={() => {
                toast.success("Assinatura confirmada!");
                onPronto();
              }}
            />
          ) : (
            <div className="space-y-3">
              {pedirCpf && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="cpf-pix"
                    className="text-xs font-medium text-foreground"
                  >
                    CPF do pagador
                  </label>
                  <input
                    id="cpf-pix"
                    autoFocus
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={mascaraDoc(cpf)}
                    onChange={(e) => setCpf(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && gerarPix()}
                    className="w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Exigido pelo banco emissor da cobrança Pix.
                  </p>
                </div>
              )}
              <Button size="lg" className="w-full" onClick={gerarPix} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                Gerar código Pix de {brl(PRO_PRICE_CENTS)}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Libera 30 dias de Pro assim que o pagamento cair. Não renova
                sozinho — quando acabar, é só pagar de novo.
              </p>
            </div>
          )}
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
