import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPixTransaction,
  getOrCreateCustomer,
  getTransaction,
  PagouError,
} from "@/lib/billing/pagou";
import { CREDIT_PACKS, CURRENCY, getCreditPack } from "@/lib/billing/plans";

export const runtime = "nodejs";

// GET -> lista os pacotes disponiveis (para a UI).
export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS, currency: CURRENCY });
}

/**
 * POST { packId } -> gera uma cobranca Pix para recarregar creditos.
 *
 * O Pix e assincrono: a recarga nasce PENDENTE e so vira credito quando a
 * Pagou confirmar o pagamento (webhook ou o polling de GET abaixo). Nunca
 * creditamos na criacao da cobranca.
 */
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
    return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email, null);

    // Referencia unica: a Pagou devolve 409 DUPLICATE_EXTERNAL_REF se repetir,
    // o que impede cobrar duas vezes o mesmo clique.
    const externalRef = `credits_${user.id}_${pack.id}_${Date.now()}`;

    const tx = await createPixTransaction({
      amountCents: pack.amountCents,
      currency: CURRENCY,
      externalRef,
      buyer: {
        id: customerId,
        name: user.email?.split("@")[0] || "Cliente xcart",
        email: user.email || `${user.id}@sem-email.xcart`,
      },
      produto: {
        name: `xcart — ${pack.label}`,
        price: pack.amountCents,
      },
      metadata: externalRef,
    });

    // Registro pendente. O credito so entra em credit_pending_purchase().
    const { error: insErr } = await admin.from("credit_purchases").insert({
      user_id: user.id,
      pagou_transaction_id: tx.id,
      provider: "pagou",
      method: "pix",
      pack_id: pack.id,
      credits: pack.credits,
      amount_cents: pack.amountCents,
      currency: CURRENCY.toLowerCase(),
      status: "pending",
    });
    if (insErr) {
      console.error("[billing/credits] falha ao registrar cobranca", insErr);
      return NextResponse.json(
        { error: "Cobrança criada, mas não foi registrada. Fale com o suporte." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      credits: pack.credits,
      amountCents: pack.amountCents,
      pix: {
        qrCode: tx.pix?.qr_code || null,
        expiresAt: tx.pix?.expiration_date || null,
      },
    });
  } catch (error) {
    if (error instanceof PagouError) {
      console.error("[billing/credits] Pagou", error.status, error.code, error.message);
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 && error.status < 500 ? error.status : 502 }
      );
    }
    console.error("[billing/credits]", error);
    return NextResponse.json({ error: "Falha ao gerar recarga." }, { status: 500 });
  }
}

/**
 * PATCH { transactionId } -> confere o pagamento sob demanda.
 *
 * A tela do QR chama isso enquanto o usuario paga, para nao depender so do
 * webhook. A fonte da verdade e sempre a API da Pagou, nunca o cliente.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const transactionId = typeof body.transactionId === "string" ? body.transactionId : "";
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  // A cobranca tem que ser deste usuario.
  const { data: compra } = await admin
    .from("credit_purchases")
    .select("id, user_id, status, credits")
    .eq("pagou_transaction_id", transactionId)
    .maybeSingle();

  if (!compra || compra.user_id !== user.id) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }
  if (compra.status === "paid") {
    return NextResponse.json({ status: "paid", credited: true });
  }

  try {
    const tx = await getTransaction(transactionId);
    if (tx.status !== "paid") {
      return NextResponse.json({ status: tx.status, credited: false });
    }
    // Atomica e idempotente: se o webhook creditou antes, devolve false.
    const { data: creditou } = await admin.rpc("credit_pending_purchase", {
      p_transaction_id: transactionId,
    });
    return NextResponse.json({ status: "paid", credited: creditou === true });
  } catch (error) {
    console.error("[billing/credits] PATCH", error);
    return NextResponse.json({ error: "Falha ao consultar." }, { status: 502 });
  }
}
