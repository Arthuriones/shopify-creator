import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Cliente da Pagou.ai (https://developer.pagou.ai)
//
// Diferencas em relacao ao Stripe que moldam este arquivo:
//  - Nao ha checkout hospedado. O cartao e tokenizado no browser (Payment
//    Element) e chega aqui como token pgct_; a assinatura e criada server-side.
//  - Nao ha portal do cliente. Cancelamento e sempre no fim do periodo.
//  - Valor, moeda, intervalo e cartao sao imutaveis: trocar exige nova
//    assinatura.
// ============================================================================

const BASE = process.env.PAGOU_API_URL?.replace(/\/$/, "") || "https://api.pagou.ai";

export class PagouError extends Error {
  status: number;
  code?: string;
  detalhes?: unknown;
  constructor(message: string, status: number, code?: string, detalhes?: unknown) {
    super(message);
    this.name = "PagouError";
    this.status = status;
    this.code = code;
    this.detalhes = detalhes;
  }
}

function token(): string {
  const t = process.env.PAGOU_SECRET_KEY;
  if (!t) throw new Error("PAGOU_SECRET_KEY nao configurada.");
  return t;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
  );
}

// URL que a Pagou chama ao mudar o estado de uma cobranca. Carrega um segredo
// no path porque a Pagou nao documenta assinatura HMAC no webhook; ainda assim
// o handler nunca confia no corpo — ver comentario no route do webhook.
export function notifyUrl(): string | undefined {
  const s = process.env.PAGOU_WEBHOOK_TOKEN;
  return s ? `${appUrl()}/api/billing/pagou/webhook?t=${encodeURIComponent(s)}` : undefined;
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* resposta nao-JSON cai no throw abaixo */
  }

  if (!res.ok) {
    const j = json as { message?: string; error?: string; code?: string } | null;
    throw new PagouError(
      j?.message || j?.error || `Pagou respondeu ${res.status}`,
      res.status,
      j?.code,
      json
    );
  }
  return (json as { data?: T })?.data ?? (json as T);
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export interface PagouCustomer {
  id: string;
  name: string;
  email: string;
  externalRef?: string | null;
}

// Garante um customer na Pagou para o usuario e guarda o id no profile.
export async function getOrCreateCustomer(
  userId: string,
  email?: string | null,
  name?: string | null
): Promise<string> {
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("pagou_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.pagou_customer_id) return profile.pagou_customer_id;

  // Pode existir de uma tentativa anterior que falhou antes de gravar.
  const encontrado = await api<PagouCustomer[]>(
    `/v2/customers?external_ref=${encodeURIComponent(userId)}&limit=1`
  ).catch(() => null);
  let id = Array.isArray(encontrado) && encontrado[0]?.id;

  if (!id) {
    const criado = await api<PagouCustomer>("/v2/customers", {
      method: "POST",
      body: {
        name: name || email?.split("@")[0] || "Cliente xcart",
        email: email || `${userId}@sem-email.xcart`,
        externalRef: userId,
      },
    });
    id = criado.id;
  }

  await supabase
    .from("profiles")
    .update({ pagou_customer_id: id })
    .eq("id", userId);

  return id;
}

// ---------------------------------------------------------------------------
// Transacoes avulsas (recarga de creditos por Pix)
// ---------------------------------------------------------------------------
export type TransactionStatus =
  | "authorized" | "canceled" | "captured" | "chargedback" | "three_ds_required"
  | "expired" | "in_protest" | "paid" | "partially_paid" | "partially_refunded"
  | "pending" | "processing" | "processed" | "refunded" | "med" | "refused";

export interface PagouTransaction {
  id: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  method: "pix" | "voucher" | "credit_card";
  pix?: {
    qr_code?: string;
    expiration_date?: string;
    end_to_end_id?: string;
    receipt_url?: string;
  } | null;
  created_at?: string;
}

export async function createPixTransaction(params: {
  amountCents: number;
  currency: string;
  externalRef: string;
  buyer: { id?: string; name: string; email: string };
  produto: { name: string; price: number };
  metadata?: string;
}): Promise<PagouTransaction> {
  return api<PagouTransaction>("/v2/transactions", {
    method: "POST",
    body: {
      amount: params.amountCents,
      currency: params.currency,
      method: "pix",
      external_ref: params.externalRef,
      buyer: params.buyer,
      products: [
        {
          name: params.produto.name,
          price: params.produto.price,
          quantity: 1,
          tangible: false,
        },
      ],
      notify_url: notifyUrl(),
      metadata: params.metadata,
    },
    idempotencyKey: params.externalRef,
  });
}

export async function getTransaction(id: string): Promise<PagouTransaction> {
  return api<PagouTransaction>(`/v2/transactions/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------
export type SubscriptionStatus =
  | "incomplete" | "trialing" | "active" | "past_due" | "cancel_scheduled" | "canceled";

export interface PagouSubscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  cardLast4?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Cartao: precisa do token pgct_ vindo do Payment Element.
// Pix automatico: nao usa token, mas exige dia de cobranca no mes.
export async function createSubscription(params: {
  customerId: string;
  amountCents: number;
  currency: string;
  userId: string;
  cardToken?: string;
  billingDayOfMonth?: number;
  idempotencyKey: string;
}): Promise<PagouSubscription> {
  const comum = {
    customer_id: params.customerId,
    interval: "month",
    interval_count: 1,
    amount: params.amountCents,
    currency: params.currency,
    failure_policy: "retry_then_cancel",
    metadata: { user_id: params.userId },
    idempotency_key: params.idempotencyKey,
  };

  const body = params.cardToken
    ? { ...comum, payment_method: "credit_card", token: params.cardToken }
    : {
        ...comum,
        payment_method: "pix_automatic",
        billing_day_of_month: params.billingDayOfMonth ?? new Date().getUTCDate(),
      };

  return api<PagouSubscription>("/v2/subscriptions", {
    method: "POST",
    body,
    idempotencyKey: params.idempotencyKey,
  });
}

export async function getSubscription(id: string): Promise<PagouSubscription> {
  return api<PagouSubscription>(`/v2/subscriptions/${encodeURIComponent(id)}`);
}

// A Pagou so agenda o cancelamento para o fim do periodo vigente.
export async function cancelSubscription(
  id: string,
  reason: "user_requested" | "payment_failure" | "chargeback" | "system" = "user_requested"
): Promise<PagouSubscription> {
  return api<PagouSubscription>(
    `/v2/subscriptions/${encodeURIComponent(id)}/cancel`,
    { method: "POST", body: { reason } }
  );
}

// Status da Pagou -> plano do app. past_due continua liberado para o usuario
// ter chance de regularizar antes de perder acesso.
export function planoDoStatus(status: SubscriptionStatus): "pro" | "free" {
  return status === "active" || status === "trialing" ||
    status === "past_due" || status === "cancel_scheduled"
    ? "pro"
    : "free";
}
