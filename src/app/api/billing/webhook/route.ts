import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { PRO_INCLUDED_CREDITS } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function userIdByCustomer(customerId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id || null;
}

function toIso(unixSeconds?: number | null): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

// Atualiza o profile a partir de um objeto de assinatura do Stripe.
async function applySubscription(sub: Stripe.Subscription) {
  const supabase = createAdminClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId =
    (sub.metadata?.user_id as string | undefined) ||
    (await userIdByCustomer(customerId));
  if (!userId) return;

  const status = sub.status; // active | past_due | canceled | unpaid | ...
  const active = status === "active" || status === "trialing" || status === "past_due";

  await supabase
    .from("profiles")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: status,
      plan: active ? "pro" : "free",
      current_period_end: toIso(
        (sub as unknown as { current_period_end?: number }).current_period_end
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json(
      { error: "Webhook nao configurado." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Assinatura invalida: ${
          error instanceof Error ? error.message : "erro"
        }`,
      },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const userId =
          (sub.metadata?.user_id as string | undefined) ||
          (await userIdByCustomer(customerId));
        if (userId) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              subscription_status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }
        break;
      }

      case "invoice.paid": {
        // Renovacao mensal (ou primeira fatura): reseta os creditos do plano.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;
        const userId = await userIdByCustomer(customerId);
        if (!userId) break;
        const periodEnd = toIso(invoice.lines?.data?.[0]?.period?.end);
        await supabase.rpc("reset_ai_credits", {
          p_user_id: userId,
          p_amount: PRO_INCLUDED_CREDITS,
          p_period_end: periodEnd,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;
        const userId = await userIdByCustomer(customerId);
        if (userId) {
          await supabase
            .from("profiles")
            .update({
              subscription_status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }
        break;
      }

      case "checkout.session.completed": {
        // Recarga avulsa de creditos (pacote). Assinatura e tratada nos
        // eventos de subscription/invoice acima.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type !== "credit_pack") break;
        const userId = session.metadata.user_id;
        const credits = Number(session.metadata.credits || 0);
        if (!userId || credits <= 0) break;

        await supabase.rpc("add_ai_credits", {
          p_user_id: userId,
          p_amount: credits,
        });
        await supabase.from("credit_purchases").insert({
          user_id: userId,
          stripe_payment_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.id,
          credits,
          amount_cents: session.amount_total || 0,
          currency: session.currency || "brl",
        });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("[billing/webhook] erro ao processar", event.type, error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
