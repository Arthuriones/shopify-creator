import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_INCLUDED_CREDITS } from "@/lib/billing/plans";

export const runtime = "nodejs";

/**
 * WEBHOOK LEGADO DO STRIPE — somente manutencao.
 *
 * A cobranca nova e toda pela Pagou (/api/billing/pagou/webhook). Este arquivo
 * existe apenas porque restam assinaturas recorrentes criadas no Stripe: sem
 * ele, a renovacao mensal delas deixaria de repor creditos e um cancelamento
 * feito no Stripe nunca chegaria ao app — o usuario continuaria "pro" de graca
 * ou perderia credito sem motivo.
 *
 * Nao cria nada novo: so reflete no profile o que o Stripe informa. Pode ser
 * apagado quando o ultimo assinante legado migrar (checar payment_provider =
 * 'stripe' em profiles).
 *
 * A verificacao de assinatura e feita a mao para nao manter a SDK do Stripe
 * como dependencia do projeto.
 */

// Header: t=<unix>,v1=<hmac sha256 de "<t>.<payload>">
function assinaturaValida(payload: string, header: string, secret: string): boolean {
  const partes = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const t = partes["t"];
  const v1 = partes["v1"];
  if (!t || !v1) return false;

  // Rejeita evento com mais de 5 min para dificultar replay.
  const idade = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(idade) || idade > 300) return false;

  const esperado = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

function idDe(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object" && "id" in valor) {
    return String((valor as { id: unknown }).id);
  }
  return undefined;
}

function toIso(unixSeconds?: unknown): string | null {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

async function userIdPorCustomer(customerId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ error: "Webhook legado desativado." }, { status: 410 });
  }

  const raw = await request.text();
  if (!assinaturaValida(raw, sig, secret)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const obj = event.data?.object || {};

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const customerId = idDe(obj.customer);
        if (!customerId) break;
        const userId =
          (obj.metadata as { user_id?: string } | undefined)?.user_id ||
          (await userIdPorCustomer(customerId));
        if (!userId) break;

        const status = String(obj.status || "canceled");
        const apagada = event.type === "customer.subscription.deleted";
        const ativa =
          !apagada &&
          ["active", "trialing", "past_due"].includes(status);

        await supabase
          .from("profiles")
          .update({
            payment_provider: "stripe",
            stripe_subscription_id: String(obj.id || ""),
            subscription_status: apagada ? "canceled" : status,
            plan: ativa ? "pro" : "free",
            current_period_end: toIso(obj.current_period_end),
            cancel_at_period_end: obj.cancel_at_period_end === true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }

      case "invoice.paid": {
        const customerId = idDe(obj.customer);
        if (!customerId) break;
        const userId = await userIdPorCustomer(customerId);
        if (!userId) break;
        const linhas = obj.lines as { data?: Array<{ period?: { end?: number } }> } | undefined;
        await supabase.rpc("reset_ai_credits", {
          p_user_id: userId,
          p_amount: PRO_INCLUDED_CREDITS,
          p_period_end: toIso(linhas?.data?.[0]?.period?.end),
        });
        break;
      }

      case "invoice.payment_failed": {
        const customerId = idDe(obj.customer);
        if (!customerId) break;
        const userId = await userIdPorCustomer(customerId);
        if (!userId) break;
        await supabase
          .from("profiles")
          .update({
            subscription_status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }

      // Compras avulsas nao passam mais por aqui: recarga e Pix na Pagou.
      default:
        break;
    }
  } catch (error) {
    console.error("[billing/webhook legado]", event.type, error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
