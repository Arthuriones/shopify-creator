import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopifyCredentials } from "@/lib/shopify/client";

export const MCP_TOKEN_PREFIX = "xcart_mcp_";

export function generateMcpToken() {
  const raw = `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashMcpToken(raw), suffix: raw.slice(-4) };
}

// SHA-256 puro (sem bcrypt) e adequado aqui: o token tem 256 bits de entropia
// aleatoria, entao nao ha ataque de dicionario a mitigar, e a verificacao roda
// em toda chamada de ferramenta — precisa ser barata.
export function hashMcpToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export interface McpIdentity {
  userId: string;
  tokenId: string;
}

export type AuthResult =
  | { ok: true; identity: McpIdentity }
  | { ok: false; reason: "invalid" | "revoked" | "expired" | "rate_limited"; retryAfter: number };

// Teto por token e por minuto. Serve para um token vazado nao conseguir
// martelar a Admin API ate a Shopify limitar a loja inteira do usuario.
const LIMITE_POR_MINUTO = 120;

export async function authenticate(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: "invalid", retryAfter: 0 };

  const raw = match[1].trim();
  if (!raw.startsWith(MCP_TOKEN_PREFIX)) return { ok: false, reason: "invalid", retryAfter: 0 };

  const hash = hashMcpToken(raw);
  const admin = createAdminClient();

  // Uma ida ao banco resolve validade, revogacao, limite e contador, sob o
  // lock da linha — duas chamadas simultaneas nao leem o mesmo contador.
  const { data, error } = await admin
    .rpc("mcp_authenticate", { p_hash: hash, p_limit: LIMITE_POR_MINUTO })
    .maybeSingle<{
      user_id: string | null;
      token_id: string | null;
      allowed: boolean;
      reason: string;
      retry_after: number;
    }>();

  if (error || !data) return { ok: false, reason: "invalid", retryAfter: 0 };

  if (!data.allowed) {
    const conhecidos = ["invalid", "revoked", "expired", "rate_limited"] as const;
    const motivo = conhecidos.find((r) => r === data.reason) ?? "invalid";
    return { ok: false, reason: motivo, retryAfter: data.retry_after ?? 0 };
  }

  return { ok: true, identity: { userId: data.user_id!, tokenId: data.token_id! } };
}

export interface StoreRow {
  id: string;
  name: string;
  shop_domain: string;
  client_id: string;
  client_secret: string;
  access_token: string | null;
  target_language: string | null;
}

export async function listStores(userId: string): Promise<StoreRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("stores")
    .select("id, name, shop_domain, client_id, client_secret, access_token, target_language")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data as StoreRow[]) || [];
}

// Sempre filtra por user_id junto com o id: o storeId chega como argumento de
// ferramenta, ou seja, e entrada controlada pelo modelo. Sem esse filtro, um
// id vazado daria acesso a loja de outra pessoa.
export async function getStore(userId: string, storeId: string): Promise<StoreRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("stores")
    .select("id, name, shop_domain, client_id, client_secret, access_token, target_language")
    .eq("user_id", userId)
    .eq("id", storeId)
    .maybeSingle();
  return (data as StoreRow) || null;
}

export function credsOf(store: StoreRow): ShopifyCredentials {
  return {
    shopDomain: store.shop_domain,
    clientId: store.client_id,
    clientSecret: store.client_secret,
    accessToken: store.access_token,
  };
}
