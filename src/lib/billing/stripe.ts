import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

let stripeClient: Stripe | null = null;

// Cliente Stripe (lazy). Usa a STRIPE_SECRET_KEY do ambiente.
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY nao configurada.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
  );
}

// Garante um Stripe Customer para o usuario e guarda o id no profile.
export async function getOrCreateCustomer(
  userId: string,
  email?: string | null
): Promise<string> {
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email: email || undefined,
    metadata: { user_id: userId },
  });

  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
