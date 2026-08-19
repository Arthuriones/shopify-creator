import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPixTransaction,
  getOrCreateCustomer,
  getTransaction,
  PagouError,
} from "@/lib/billing/pagou";
import {
  CREDIT_PACKS,
  CURRENCY,
  getCreditPack,
  PRO_INCLUDED_CREDITS,
  PRO_PRICE_CENTS,
} from "@/lib/billing/plans";
import { digitos, normalizarDocumento } from "@/lib/billing/documento";

export const runtime = "nodejs";

// Um mes de Pro pago por Pix, tratado como se fosse um pacote. A Pagou so faz
// recorrencia por cartao (pix_automatic vem UNSUPPORTED nesta conta), entao
// este e o caminho para quem nao quer usar cartao. Nao renova sozinho.
export const PRO_PIX_ID = "pro_month";

function itemDe(packId: string) {
  if (packId === PRO_PIX_ID) {
    return {
      id: PRO_PIX_ID,
      kind: "pro_month" as const,
      credits: PRO_INCLUDED_CREDITS,
      amountCents: PRO_PRICE_CENTS,
      nome: "xcart Pro — 30 dias",
    };
  }
  const pack = getCreditPack(packId);
  if (!pack) return null;
  return {
    id: pack.id,
    kind: "credits" as const,
    credits: pack.credits,
    amountCents: pack.amountCents,
    nome: `xcart — ${pack.label}`,
  };
}

// GET -> pacotes disponiveis (para a UI).
export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS, currency: CURRENCY });
}

/**
 * POST { packId, document? } -> gera uma cobranca Pix.
 *
 * packId pode ser um pacote de creditos ou "pro_month" (30 dias de Pro).
 *
 * O Pix e assincrono: a compra nasce PENDENTE e so e aplicada quando a Pagou
 * confirmar (webhook ou o PATCH abaixo). Nunca creditamos na criacao.
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
  const item = itemDe(typeof body.packId === "string" ? body.packId : "");
  if (!item) {
    return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // CPF: usa o que ja esta salvo; se vier um novo no corpo, valida e guarda.
  const { data: perfil } = await admin
    .from("profiles")
    .select("document_number")
    .eq("id", user.id)
    .maybeSingle();

  const informado = digitos(typeof body.document === "string" ? body.document : "");
  const bruto = informado || digitos(perfil?.document_number || "");

  if (!bruto) {
    // O front usa needsDocument para abrir o campo em vez de mostrar erro cru.
    return NextResponse.json(
      { error: "Informe seu CPF para gerar a cobrança Pix.", needsDocument: true },
      { status: 400 }
    );
  }
  const doc = normalizarDocumento(bruto);
  if (!doc) {
    return NextResponse.json(
      {
        error: `${bruto.length > 11 ? "CNPJ" : "CPF"} inválido. Confira os números.`,
        needsDocument: true,
      },
      { status: 400 }
    );
  }
  if (informado && informado !== digitos(perfil?.document_number || "")) {
    await admin
      .from("profiles")
      .update({ document_number: doc.number, document_type: doc.type })
      .eq("id", user.id);
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email, null, doc);

    // Referencia unica: a Pagou devolve 409 DUPLICATE_EXTERNAL_REF se repetir,
    // o que impede cobrar duas vezes o mesmo clique.
    const externalRef = `${item.kind}_${user.id}_${item.id}_${Date.now()}`;

    const tx = await createPixTransaction({
      amountCents: item.amountCents,
      currency: CURRENCY,
      externalRef,
      buyer: {
        id: customerId,
        name: user.email?.split("@")[0] || "Cliente xcart",
        email: user.email || `${user.id}@sem-email.xcart`,
        document: doc,
      },
      produto: { name: item.nome, price: item.amountCents },
      metadata: externalRef,
    });

    // Registro pendente. A aplicacao acontece em apply_paid_purchase().
    const { error: insErr } = await admin.from("credit_purchases").insert({
      user_id: user.id,
      pagou_transaction_id: tx.id,
      provider: "pagou",
      method: "pix",
      kind: item.kind,
      pack_id: item.id,
      credits: item.credits,
      amount_cents: item.amountCents,
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
      kind: item.kind,
      credits: item.credits,
      amountCents: item.amountCents,
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
    return NextResponse.json({ error: "Falha ao gerar cobrança." }, { status: 500 });
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
  const transactionId =
    typeof body.transactionId === "string" ? body.transactionId : "";
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  // A cobranca tem que ser deste usuario.
  const { data: compra } = await admin
    .from("credit_purchases")
    .select("id, user_id, status, kind")
    .eq("pagou_transaction_id", transactionId)
    .maybeSingle();

  if (!compra || compra.user_id !== user.id) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }
  if (compra.status === "paid") {
    return NextResponse.json({ status: "paid", credited: true, kind: compra.kind });
  }

  try {
    const tx = await getTransaction(transactionId);
    if (tx.status !== "paid") {
      return NextResponse.json({ status: tx.status, credited: false });
    }
    // Atomica e idempotente: se o webhook aplicou antes, devolve false.
    const { data: aplicou } = await admin.rpc("apply_paid_purchase", {
      p_transaction_id: transactionId,
    });
    return NextResponse.json({
      status: "paid",
      credited: aplicou === true,
      kind: compra.kind,
    });
  } catch (error) {
    console.error("[billing/credits] PATCH", error);
    return NextResponse.json({ error: "Falha ao consultar." }, { status: 502 });
  }
}
