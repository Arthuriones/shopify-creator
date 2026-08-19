"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// Payment Element da Pagou.
//
// A Pagou nao tem checkout hospedado: o cartao e digitado num iframe servido
// por js.pagou.ai, que devolve um token pgct_. O numero do cartao nunca passa
// pelo nosso dominio nem pelo nosso servidor.
// ============================================================================

const SCRIPT = "https://js.pagou.ai/payments/v3.js";

interface PagouElements {
  create(tipo: "card", opts?: Record<string, unknown>): { mount(seletor: string): void };
  submit(opts: {
    createTransaction: (tokenData: { token: string }) => Promise<unknown>;
  }): Promise<
    | {
        // O SDK devolve status terminal ou requires_action; error vem como
        // string em erro de tokenizacao e como objeto vindo da API.
        status?: string;
        error?: string | { message?: string };
      }
    | undefined
  >;
}
interface PagouGlobal {
  setEnvironment(env: "sandbox" | "production"): void;
  elements(opts: { publicKey: string; locale?: string; origin?: string }): PagouElements;
}
declare global {
  interface Window {
    Pagou?: PagouGlobal;
  }
}

let carregando: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  if (window.Pagou) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Não foi possível carregar o formulário de pagamento."));
    document.head.appendChild(s);
  });
  return carregando;
}

export function PagouCardForm({
  onSuccess,
  labelBotao,
}: {
  onSuccess: (dados: unknown) => void;
  labelBotao: string;
}) {
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const elementsRef = useRef<PagouElements | null>(null);
  const montado = useRef(false);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_PAGOU_PUBLIC_KEY;
    if (!publicKey) {
      setErro("NEXT_PUBLIC_PAGOU_PUBLIC_KEY não configurada.");
      return;
    }
    let vivo = true;

    carregarScript()
      .then(() => {
        if (!vivo || montado.current || !window.Pagou) return;
        montado.current = true;

        window.Pagou.setEnvironment(
          process.env.NEXT_PUBLIC_PAGOU_ENV === "production" ? "production" : "sandbox"
        );
        const elements = window.Pagou.elements({
          publicKey,
          locale: "pt",
          origin: window.location.origin,
        });
        elements.create("card", { theme: "default" }).mount("#pagou-card-element");
        elementsRef.current = elements;
        setPronto(true);
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));

    return () => {
      vivo = false;
    };
  }, []);

  async function enviar() {
    if (!elementsRef.current || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      // O SDK tokeniza o cartao e chama este callback com o token pgct_.
      // A assinatura e criada no nosso backend, nunca no browser.
      const resultado = await elementsRef.current.submit({
        createTransaction: async (tokenData) => {
          const res = await fetch("/api/billing/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardToken: tokenData.token }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Falha ao assinar.");
          onSuccess(data);
          // O SDK passa este retorno para resolvePayment(), que espera uma
          // TRANSACAO (le id/status/next_action). Devolver a assinatura faria
          // ele tratar 3DS com o objeto errado.
          return data.transaction || { id: data.subscriptionId, status: data.status };
        },
      });
      // O SDK devolve { status, error } — error pode ser string ou objeto.
      const err = resultado?.error as unknown;
      const msg =
        typeof err === "string" ? err : (err as { message?: string })?.message;
      if (msg) setErro(msg);
      else if (resultado?.status === "requires_action")
        setErro("O banco pediu autenticação adicional. Tente outro cartão.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar o cartão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        id="pagou-card-element"
        className="min-h-[52px] rounded-lg border border-border/60 bg-background/45 p-3"
      />
      {!pronto && !erro && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando formulário seguro…
        </p>
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <Button onClick={enviar} disabled={!pronto || enviando} className="w-full">
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {labelBotao}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Os dados do cartão são digitados em um campo da Pagou e não passam pelos
        nossos servidores.
      </p>
    </div>
  );
}
