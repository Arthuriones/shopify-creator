import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getOrCreateCustomer, getStripe } from "@/lib/billing/stripe";
import { CREDIT_PACKS, getCreditPack } from "@/lib/billing/plans";

export const runtime = "nodejs";

// GET -> lista os pacotes disponiveis (para a UI).
export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS });
}

// POST { packId } -> Checkout one-time para recarregar creditos.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pack = getCreditPack(typeof body.packId === "string" ? body.packId : "");
  if (!pack) {
    return NextResponse.json({ error: "Pacote invalido." }, { status: 400 });
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email);
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.amountCents,
            product_data: {
              name: `Xcart — ${pack.label}`,
              description: `Recarga de ${pack.credits} créditos de IA`,
            },
          },
        },
      ],
      // metadata usada pelo webhook para creditar a conta.
      metadata: {
        user_id: user.id,
        type: "credit_pack",
        pack_id: pack.id,
        credits: String(pack.credits),
      },
      success_url: `${appUrl()}/billing?status=credits_success`,
      cancel_url: `${appUrl()}/billing?status=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao criar recarga.",
      },
      { status: 500 }
    );
  }
}
