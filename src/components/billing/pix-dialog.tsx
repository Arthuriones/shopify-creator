"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ============================================================================
// Cobranca Pix.
//
// Pix e assincrono: o usuario paga fora do app e a confirmacao chega depois.
// Esta tela consulta o backend periodicamente em vez de depender so do webhook,
// porque o webhook pode atrasar — e quem esta olhando a tela quer feedback.
// A confirmacao sempre vem da API da Pagou, nunca do cliente.
// ============================================================================

export interface CobrancaPix {
  transactionId: string;
  credits: number;
  amountCents: number;
  pix: { qrCode: string | null; expiresAt: string | null };
}

const INTERVALO_MS = 4000;
const LIMITE_MS = 12 * 60 * 1000; // 12 min: acima disso o QR normalmente expira

export function PixDialog({
  cobranca,
  onPago,
  onFechar,
}: {
  cobranca: CobrancaPix;
  onPago: () => void;
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [status, setStatus] = useState<"aguardando" | "pago" | "expirado">("aguardando");
  const inicio = useRef(Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Renderiza o QR no proprio canvas, sem enviar o payload para fora.
  useEffect(() => {
    const codigo = cobranca.pix.qrCode;
    if (!codigo || !canvasRef.current || status !== "aguardando") return;
    let vivo = true;
    import("qrcode").then((QR) => {
      if (!vivo || !canvasRef.current) return;
      QR.toCanvas(canvasRef.current, codigo, {
        width: 416,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {
        /* se falhar, o copia-e-cola abaixo continua servindo */
      });
    });
    return () => {
      vivo = false;
    };
  }, [cobranca.pix.qrCode, status]);

  useEffect(() => {
    if (status !== "aguardando") return;
    let vivo = true;

    const timer = setInterval(async () => {
      if (!vivo) return;
      if (Date.now() - inicio.current > LIMITE_MS) {
        setStatus("expirado");
        return;
      }
      try {
        const res = await fetch("/api/billing/credits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: cobranca.transactionId }),
        });
        const data = await res.json();
        if (!vivo) return;
        if (data.status === "paid") {
          setStatus("pago");
          onPago();
        } else if (["refused", "canceled", "expired"].includes(data.status)) {
          setStatus("expirado");
        }
      } catch {
        /* rede instavel: tenta de novo no proximo ciclo */
      }
    }, INTERVALO_MS);

    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [cobranca.transactionId, status, onPago]);

  async function copiar() {
    if (!cobranca.pix.qrCode) return;
    try {
      await navigator.clipboard.writeText(cobranca.pix.qrCode);
      setCopiado(true);
      toast.success("Código Pix copiado.");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  const reais = (cobranca.amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
        {status === "pago" ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Pagamento confirmado</h3>
            <p className="text-sm text-muted-foreground">
              {cobranca.credits} créditos entraram na sua conta.
            </p>
            <Button className="w-full" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        ) : status === "expirado" ? (
          <div className="space-y-3 text-center">
            <h3 className="text-lg font-semibold">Cobrança expirada</h3>
            <p className="text-sm text-muted-foreground">
              O código Pix não foi pago a tempo. Nada foi cobrado — é só gerar
              outro.
            </p>
            <Button className="w-full" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">
                Pague {reais} no Pix
              </h3>
            </div>

            {cobranca.pix.qrCode ? (
              <>
                <div className="flex justify-center rounded-xl bg-white p-4">
                  {/* Desenhado localmente: mandar o payload do Pix para um
                      gerador de QR de terceiro vazaria a cobranca. */}
                  <canvas ref={canvasRef} className="h-52 w-52" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Ou use o copia e cola:</p>
                  <div className="flex gap-2">
                    <code className="flex-1 truncate rounded-lg border border-border/60 bg-background/45 px-3 py-2 text-[11px]">
                      {cobranca.pix.qrCode}
                    </code>
                    <Button size="sm" variant="outline" onClick={copiar}>
                      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-destructive">
                A Pagou não devolveu o código Pix. Tente gerar novamente.
              </p>
            )}

            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Aguardando confirmação. Os créditos entram sozinhos.
            </p>

            <Button variant="ghost" className="w-full" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
