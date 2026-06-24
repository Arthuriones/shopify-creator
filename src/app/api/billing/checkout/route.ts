import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getOrCreateCustomer, getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// POST -> cria uma Checkout Session de ASSINATURA (plano Pro R$89/mes).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.STRIPE_PRICE_ID) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_ID nao configurada." },
      { status: 500 }
    );
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl()}/billing?status=success`,
      cancel_url: `${appUrl()}/billing?status=cancel`,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao criar checkout.",
      },
      { status: 500 }
    );
  }
}
