import { createHash, randomBytes, timingSafeEqual } from "crypto";
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

export async function authenticate(req: Request): Promise<McpIdentity | null> {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const raw = match[1].trim();
  if (!raw.startsWith(MCP_TOKEN_PREFIX)) return null;

  const hash = hashMcpToken(raw);
  const admin = createAdminClient();
  const { data } = await admin
    .from("mcp_tokens")
    .select("id, user_id, token_hash, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // O lookup ja e por igualdade exata no banco; a comparacao constante aqui
  // evita depender do timing do Postgres para nao vazar informacao.
  const a = Buffer.from(data.token_hash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Sem await: atualizar o "visto por ultimo" nao pode atrasar a ferramenta.
  void admin
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { userId: data.user_id, tokenId: data.id };
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
