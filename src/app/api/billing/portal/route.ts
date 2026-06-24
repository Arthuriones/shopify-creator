import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getOrCreateCustomer, getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// POST -> abre o Customer Portal do Stripe (gerenciar/cancelar assinatura).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email);
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl()}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao abrir portal.",
      },
      { status: 500 }
    );
  }
}
