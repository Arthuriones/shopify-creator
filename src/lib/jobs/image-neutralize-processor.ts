import { neutralizeProductImage } from "@/lib/ai/product-neutralizer";
import {
  replaceProductHeroImage,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const IMAGE_JOB_TYPE = "neutralize_image";
const MAX_ATTEMPTS = 3;

type CleanupMode = "stock-neutralize" | "external-references";

export interface ImageNeutralizeItem {
  productId: string;
  imageUrl: string;
  title: string;
  mode?: CleanupMode;
  customInstructions?: string;
  targetLanguage?: string;
}

interface ImageJobPayload extends ImageNeutralizeItem {
  attempts?: number;
  step?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Pool de concorrencia simples: roda `worker` em paralelo respeitando o limite.
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index]);
      }
    }
  );
  await Promise.all(runners);
}

async function loadStoreCredentials(
  supabase: AdminClient,
  userId: string,
  storeId: string
): Promise<{ creds: ShopifyCredentials } | null> {
  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, client_id, client_secret, access_token")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();

  if (!store) return null;

  return {
    creds: {
      shopDomain: store.shop_domain,
      clientId: store.client_id,
      clientSecret: store.client_secret,
      accessToken: store.access_token,
    },
  };
}

// Enfileira 1 job de imagem por produto (resumivel: cada produto e uma linha).
export async function enqueueImageNeutralizeJobs(input: {
  userId: string;
  storeId: string;
  items: ImageNeutralizeItem[];
}): Promise<{ queued: number }> {
  const items = input.items.filter((item) => item.productId && item.imageUrl);
  if (items.length === 0) return { queued: 0 };

  const supabase = createAdminClient();
  const rows = items.map((item) => ({
    user_id: input.userId,
    store_id: input.storeId,
    type: IMAGE_JOB_TYPE,
    status: "pending",
    progress: {
      ...item,
      attempts: 0,
      step: "Aguardando",
    } satisfies ImageJobPayload,
  }));

  const { error } = await supabase.from("background_jobs").insert(rows);
  if (error) {
    throw new Error(`Falha ao enfileirar imagens: ${error.message}`);
  }

  return { queued: rows.length };
}

// Dispara (fire-and-forget) um ciclo de drenagem pela rota HTTP, que se
// auto-encadeia ate a fila esvaziar. Usa o cookie da requisicao original para
// autenticar. Independente do cliente manter a janela aberta.
export async function requestImageQueueDrain(input: {
  origin: string;
  cookie: string;
  storeId: string;
  chain?: boolean;
}): Promise<void> {
  try {
    await fetch(`${input.origin}/api/jobs/neutralize-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: input.cookie,
      },
      body: JSON.stringify({ storeId: input.storeId, chain: input.chain === true }),
    });
  } catch {
    // fire-and-forget: a fila tambem e retomada na proxima abertura da janela.
  }
}

async function countByStatus(
  supabase: AdminClient,
  userId: string,
  storeId: string,
  status: string
) {
  const { count } = await supabase
    .from("background_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("type", IMAGE_JOB_TYPE)
    .eq("status", status);
  return count || 0;
}

export interface ImageQueueProgress {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export async function getImageQueueProgress(input: {
  userId: string;
  storeId: string;
}): Promise<ImageQueueProgress> {
  const supabase = createAdminClient();
  const [pending, processing, completed, failed] = await Promise.all([
    countByStatus(supabase, input.userId, input.storeId, "pending"),
    countByStatus(supabase, input.userId, input.storeId, "processing"),
    countByStatus(supabase, input.userId, input.storeId, "completed"),
    countByStatus(supabase, input.userId, input.storeId, "failed"),
  ]);

  return {
    pending,
    processing,
    completed,
    failed,
    total: pending + processing + completed + failed,
  };
}

// Drena a fila de imagens de uma loja: processa lotes em paralelo ate esvaziar
// ou ate estourar o orcamento de tempo (para nao bater no maxDuration da rota).
export async function processImageNeutralizeJobs(input: {
  userId: string;
  storeId: string;
  concurrency?: number;
  timeBudgetMs?: number;
}): Promise<{
  processed: number;
  completed: number;
  failed: number;
  remaining: number;
}> {
  const supabase = createAdminClient();
  const concurrency = Math.min(Math.max(input.concurrency ?? 5, 1), 10);
  const timeBudgetMs = Math.min(
    Math.max(input.timeBudgetMs ?? 240000, 10000),
    280000
  );
  const start = Date.now();

  const summary = { processed: 0, completed: 0, failed: 0, remaining: 0 };

  const loaded = await loadStoreCredentials(supabase, input.userId, input.storeId);
  if (!loaded) {
    summary.remaining = await countByStatus(
      supabase,
      input.userId,
      input.storeId,
      "pending"
    );
    return summary;
  }

  const { creds } = loaded;
  const storageClient = createAdminClient();

  // Recupera jobs orfaos: ficaram marcados "processing" mas a invocacao
  // serverless morreu antes de terminar (sem isso eles nunca mais sao pegos,
  // pois a fila so busca status "pending"). updated_at e atualizado pelo
  // trigger do banco quando o job foi reivindicado.
  const staleCutoff = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  await supabase
    .from("background_jobs")
    .update({ status: "pending" })
    .eq("user_id", input.userId)
    .eq("store_id", input.storeId)
    .eq("type", IMAGE_JOB_TYPE)
    .eq("status", "processing")
    .lt("updated_at", staleCutoff);

  while (Date.now() - start < timeBudgetMs) {
    const { data: batch } = await supabase
      .from("background_jobs")
      .select("id, progress")
      .eq("user_id", input.userId)
      .eq("store_id", input.storeId)
      .eq("type", IMAGE_JOB_TYPE)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(concurrency);

    const jobs = (batch || []) as { id: string; progress: ImageJobPayload }[];
    if (jobs.length === 0) break;

    // Marca o lote como em processamento (claim otimista).
    await supabase
      .from("background_jobs")
      .update({ status: "processing" })
      .in(
        "id",
        jobs.map((job) => job.id)
      );

    await runPool(jobs, concurrency, async (job) => {
      const payload = (job.progress || {}) as ImageJobPayload;
      try {
        const neutral = await neutralizeProductImage({
          userId: input.userId,
          imageUrl: payload.imageUrl,
          title: payload.title,
          mode: payload.mode || "stock-neutralize",
          customInstructions: payload.customInstructions,
          targetLanguage: payload.targetLanguage,
          storageClient,
        });

        await replaceProductHeroImage(creds, payload.productId, {
          src: neutral.src,
          altText: payload.title,
        });

        await supabase
          .from("background_jobs")
          .update({
            status: "completed",
            progress: { ...payload, step: "Concluido" },
            result: { imageUrl: neutral.src },
            error: null,
          })
          .eq("id", job.id);
        summary.completed += 1;
      } catch (error) {
        const attempts = (payload.attempts || 0) + 1;
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao neutralizar imagem.";
        const exhausted = attempts >= MAX_ATTEMPTS;
        await supabase
          .from("background_jobs")
          .update({
            status: exhausted ? "failed" : "pending",
            progress: {
              ...payload,
              attempts,
              step: exhausted ? "Falhou" : "Vai retentar",
            },
            error: message,
          })
          .eq("id", job.id);
        if (exhausted) summary.failed += 1;
      } finally {
        summary.processed += 1;
      }
    });
  }

  summary.remaining = await countByStatus(
    supabase,
    input.userId,
    input.storeId,
    "pending"
  );
  return summary;
}
