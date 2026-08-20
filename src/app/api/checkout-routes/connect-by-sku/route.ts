import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getProducts,
  updateVariantSkus,
  type ShopifyCredentials,
} from "@/lib/shopify/client";
import { normalizarSkus } from "@/lib/shopify/sku-stamp";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ConnectedVariant {
  id: string;
  title?: string;
  sku?: string | null;
  selectedOptions?: { name: string; value: string }[];
}

interface ConnectedProduct {
  id: string;
  title: string;
  variants?: { nodes?: ConnectedVariant[] };
}

interface FlatVariant {
  id: string;
  sku: string | null;
  label: string;
  // Usado para detectar o mesmo SKU em produtos DIFERENTES, que faz o cliente
  // ser roteado para o produto errado.
  productId: string;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function flattenVariants(products: ConnectedProduct[]): FlatVariant[] {
  const flat: FlatVariant[] = [];
  for (const product of products) {
    for (const variant of product.variants?.nodes || []) {
      const optionLabel = (variant.selectedOptions || [])
        .map((option) => option.value)
        .filter(Boolean)
        .join(" / ");
      flat.push({
        id: variant.id,
        sku: variant.sku?.trim() || null,
        label: `${product.title} ${optionLabel}`.trim(),
        productId: product.id || product.title,
      });
    }
  }
  return flat;
}

async function getAllProducts(
  creds: ShopifyCredentials
): Promise<ConnectedProduct[]> {
  const all: ConnectedProduct[] = [];
  let after: string | null = null;
  // Hard cap defensivo: 40 paginas * 250 = 10k produtos.
  for (let page = 0; page < 40; page += 1) {
    const data = await getProducts(creds, { first: 250, after });
    const nodes = (data?.products?.nodes || []) as ConnectedProduct[];
    all.push(...nodes);
    const pageInfo = data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }
  return all;
}

async function getStoreCredentials(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .eq("user_id", userId)
    .single();
  return store;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceStoreId =
    typeof body.sourceStoreId === "string" ? body.sourceStoreId : "";
  const targetStoreId =
    typeof body.targetStoreId === "string" ? body.targetStoreId : "";
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "Rota por SKU";
  const createRoute = body.createRoute !== false;

  if (!sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "Selecione a vitrine e a loja checkout." },
      { status: 400 }
    );
  }
  if (sourceStoreId === targetStoreId) {
    return NextResponse.json(
      { error: "A vitrine e a loja checkout precisam ser lojas diferentes." },
      { status: 400 }
    );
  }

  const [sourceStore, targetStore] = await Promise.all([
    getStoreCredentials(sourceStoreId, user.id),
    getStoreCredentials(targetStoreId, user.id),
  ]);
  if (!sourceStore || !targetStore) {
    return NextResponse.json(
      { error: "Uma das lojas nao foi encontrada." },
      { status: 404 }
    );
  }

  const sourceCreds: ShopifyCredentials = {
    shopDomain: sourceStore.shop_domain,
    clientId: sourceStore.client_id,
    clientSecret: sourceStore.client_secret,
    accessToken: sourceStore.access_token,
  };
  const targetCreds: ShopifyCredentials = {
    shopDomain: targetStore.shop_domain,
    clientId: targetStore.client_id,
    clientSecret: targetStore.client_secret,
    accessToken: targetStore.access_token,
  };

  try {
    const [sourceProducts, targetProducts] = await Promise.all([
      getAllProducts(sourceCreds),
      getAllProducts(targetCreds),
    ]);

    // ------------------------------------------------------------------
    // Antes de casar: garante que a vitrine tem SKU unico em toda variante.
    //
    // Produto criado na mao no Shopify vem sem SKU e nunca rotearia. Em vez
    // de acusar o problema e mandar o lojista preencher tudo na mao, o app
    // carimba um SKU neutro e segue. SKU repetido tambem e corrigido aqui:
    // repetido nao e "nao roteia", e "roteia pro produto errado".
    // ------------------------------------------------------------------
    const carimbo = await normalizarSkus(sourceCreds, sourceProducts);
    for (const product of sourceProducts) {
      for (const variant of product.variants?.nodes || []) {
        const final = carimbo.skuPorVariante.get(variant.id);
        if (final) variant.sku = final;
      }
    }

    const sourceVariants = flattenVariants(sourceProducts);
    const targetVariants = flattenVariants(targetProducts);

    const targetBySku = new Map<string, FlatVariant>();
    const targetByLabel = new Map<string, FlatVariant>();
    for (const variant of targetVariants) {
      if (variant.sku) targetBySku.set(variant.sku.toLowerCase(), variant);
      targetByLabel.set(normalizeKey(variant.label), variant);
    }

    const skuMap: Record<string, string> = {};
    const variantMap: Record<string, string> = {};
    let matchedBySku = 0;
    let matchedByLabel = 0;
    const unmatched: string[] = [];

    // Par casado pelo NOME cujo destino esta sem SKU: grava o SKU da vitrine
    // no destino. Da proxima vez o par casa por SKU e para de depender do
    // titulo — que a neutralizacao reescreve.
    const propagar = new Map<string, { variantId: string; sku: string }[]>();

    for (const variant of sourceVariants) {
      const bySku = variant.sku
        ? targetBySku.get(variant.sku.toLowerCase())
        : undefined;
      const target = bySku || targetByLabel.get(normalizeKey(variant.label));
      if (!target) {
        unmatched.push(variant.label || variant.id);
        continue;
      }
      variantMap[variant.id] = target.id;
      if (variant.sku) skuMap[variant.sku] = target.id;
      if (bySku) {
        matchedBySku += 1;
      } else {
        matchedByLabel += 1;
        if (variant.sku && !target.sku) {
          const lista = propagar.get(target.productId) || [];
          lista.push({ variantId: target.id, sku: variant.sku });
          propagar.set(target.productId, lista);
        }
      }
    }

    let skusPropagados = 0;
    for (const [productId, updates] of propagar) {
      try {
        await updateVariantSkus(targetCreds, productId, updates);
        skusPropagados += updates.length;
      } catch {
        // Best-effort: a rota ja funciona pelo variant_map. Falhar aqui so
        // significa que o par continua dependendo do titulo.
      }
    }

    // ------------------------------------------------------------------
    // Diagnostico antes de ligar a rota.
    //
    // Um usuario ligou uma rota com 27% de cobertura e o app nao avisou nada:
    // 3 em cada 4 clientes dele nao eram redirecionados e ninguem sabia por
    // que. Estes tres numeros explicam praticamente todos os casos.
    // ------------------------------------------------------------------
    const semSku = sourceVariants.filter((v) => !v.sku).length;

    // SKU repetido entre produtos DIFERENTES da vitrine e o pior caso: nao e
    // "nao roteia", e "roteia para o produto errado" — o cliente paga por um
    // item e recebe outro.
    const produtosPorSku = new Map<string, Set<string>>();
    for (const v of sourceVariants) {
      if (!v.sku) continue;
      const chave = v.sku.toLowerCase();
      if (!produtosPorSku.has(chave)) produtosPorSku.set(chave, new Set());
      produtosPorSku.get(chave)!.add(v.productId);
    }
    const skusDuplicados = [...produtosPorSku.entries()]
      .filter(([, produtos]) => produtos.size > 1)
      .map(([sku]) => sku);

    const cobertura =
      sourceVariants.length > 0
        ? Object.keys(variantMap).length / sourceVariants.length
        : 0;

    const avisos: string[] = [];
    // carimbadas/desduplicadas nao entram aqui: sao conserto, nao problema.
    // O wizard mostra os dois num painel proprio.
    if (semSku > 0) {
      avisos.push(
        `${semSku} variante(s) continuam sem SKU (falha ao gravar na vitrine). O roteamento casa exclusivamente por SKU.`
      );
    }
    if (skusDuplicados.length > 0) {
      avisos.push(
        `${skusDuplicados.length} SKU(s) ainda se repetem em produtos diferentes da vitrine. Isso manda o cliente para o produto ERRADO no checkout.`
      );
    }
    for (const falha of carimbo.falhas.slice(0, 5)) {
      avisos.push(`Falha ao gravar SKU — ${falha}`);
    }
    if (cobertura < 1 && sourceVariants.length > 0) {
      avisos.push(
        `Apenas ${Math.round(cobertura * 100)}% das variantes tem destino. O resto cai no checkout da vitrine.`
      );
    }
    if (matchedByLabel > 0) {
      avisos.push(
        `${matchedByLabel} variante(s) casaram pelo nome, nao pelo SKU. Se um titulo mudar, essas param de rotear.`
      );
    }

    // Abaixo deste patamar a rota nasce DESLIGADA: ligar do jeito que esta
    // manda a maior parte do trafego para o checkout errado, em silencio.
    const COBERTURA_MINIMA = 0.9;
    const seguro = cobertura >= COBERTURA_MINIMA && skusDuplicados.length === 0;

    let route: { id?: string; public_token?: string } | null = null;
    if (createRoute && Object.keys(variantMap).length > 0) {
      const { data, error } = await supabase
        .from("routed_checkout_configs")
        .insert({
          user_id: user.id,
          source_store_id: sourceStoreId,
          target_store_id: targetStoreId,
          name,
          mode: "enterprise_static",
          public_token: randomUUID(),
          // Rota ruim nasce desligada, para o usuario ver o aviso antes de
          // colocar trafego em cima.
          enabled: seguro,
          sku_map: skuMap,
          variant_map: variantMap,
          settings: { generatedBy: "connect_by_sku" },
        })
        .select("id, public_token")
        .single();
      if (error) {
        return NextResponse.json(
          { error: "Variantes casadas, mas falhou ao criar a rota." },
          { status: 500 }
        );
      }
      route = data;
    }

    return NextResponse.json({
      sourceVariantCount: sourceVariants.length,
      targetVariantCount: targetVariants.length,
      matchedCount: Object.keys(variantMap).length,
      matchedBySku,
      matchedByLabel,
      unmatchedCount: unmatched.length,
      // --- diagnostico ---
      coveragePercent: Math.round(cobertura * 100),
      missingSkuCount: semSku,
      duplicateSkus: skusDuplicados.slice(0, 20),
      duplicateSkuCount: skusDuplicados.length,
      warnings: avisos,
      // O que o app consertou sozinho, para o wizard mostrar em vez de so
      // reclamar do estado da loja.
      stampedSkuCount: carimbo.carimbadas,
      dedupedSkuCount: carimbo.desduplicadas,
      propagatedSkuCount: skusPropagados,
      safeToEnable: seguro,
      enabled: seguro,
      skuMap,
      variantMap,
      route,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao conectar por SKU.",
      },
      { status: 500 }
    );
  }
}
