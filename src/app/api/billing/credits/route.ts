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

// A Pagou exige CPF/CNPJ do pagador em cobranca Pix. Validamos o digito
// verificador aqui: um CPF invalido so seria rejeitado la, com 422 generico.
function digitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  // O guard de digitos repetidos nao e detalhe: 11111111111 PASSA no digito
  // verificador. Sem ele, CPF falso so seria barrado la na Pagou, com 422.
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const [ate, pos] of [[9, 10], [10, 11]] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (pos - i);
    let d = (soma * 10) % 11;
    if (d === 10) d = 0;
    if (d !== Number(cpf[ate])) return false;
  }
  return true;
}

function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return (
    calc(cnpj.slice(0, 12)) === Number(cnpj[12]) &&
    calc(cnpj.slice(0, 13)) === Number(cnpj[13])
  );
}

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

  // CPF: usa o que ja esta salvo; se vier um novo no corpo, valida e guarda.
  const { data: perfil } = await admin
    .from("profiles")
    .select("document_number, document_type")
    .eq("id", user.id)
    .maybeSingle();

  const informado = digitos(typeof body.document === "string" ? body.document : "");
  const documento = informado || digitos(perfil?.document_number || "");

  if (!documento) {
    // O front usa isto para abrir o campo de CPF em vez de mostrar erro cru.
    return NextResponse.json(
      { error: "Informe seu CPF para gerar a cobrança Pix.", needsDocument: true },
      { status: 400 }
    );
  }
  const tipo: "CPF" | "CNPJ" = documento.length > 11 ? "CNPJ" : "CPF";
  const ok = tipo === "CPF" ? cpfValido(documento) : cnpjValido(documento);
  if (!ok) {
    return NextResponse.json(
      { error: `${tipo} inválido. Confira os números.`, needsDocument: true },
      { status: 400 }
    );
  }
  if (informado && informado !== digitos(perfil?.document_number || "")) {
    await admin
      .from("profiles")
      .update({ document_number: documento, document_type: tipo })
      .eq("id", user.id);
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email, null, {
      type: tipo,
      number: documento,
    });

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
        document: { type: tipo, number: documento },
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
