import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Atualiza SO as settings de checkout de uma rota (dominio/pais/locale), sem
// tocar nos mapas. Usado quando o dominio da dark store muda ou para forcar a
// moeda do checkout (Shopify Markets).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id obrigatorio." }, { status: 400 });
  }

  const checkoutDomain =
    typeof body.checkoutDomain === "string" ? body.checkoutDomain.trim() : "";
  const checkoutCountry =
    typeof body.checkoutCountry === "string"
      ? body.checkoutCountry.trim().toUpperCase().slice(0, 2)
      : "";
  const checkoutLocale =
    typeof body.checkoutLocale === "string"
      ? body.checkoutLocale.trim().slice(0, 8)
      : "";

  const { data: current, error: readError } = await supabase
    .from("routed_checkout_configs")
    .select("settings")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: "Rota nao encontrada." }, { status: 404 });
  }

  const settings = {
    ...((current.settings || {}) as Record<string, unknown>),
  };
  // String vazia remove o override (volta ao automatico/loja conectada).
  if (checkoutDomain) settings.checkout_domain = checkoutDomain;
  else delete settings.checkout_domain;
  if (checkoutCountry) settings.checkout_country = checkoutCountry;
  else delete settings.checkout_country;
  if (checkoutLocale) settings.checkout_locale = checkoutLocale;
  else delete settings.checkout_locale;

  const { data, error } = await supabase
    .from("routed_checkout_configs")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, settings")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Nao foi possivel salvar as configuracoes." },
      { status: 500 }
    );
  }

  return NextResponse.json({ config: data });
}
