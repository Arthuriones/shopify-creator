import { NextRequest, NextResponse } from "next/server";
import { healRoute, HealRouteError } from "@/lib/checkout-routes/heal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// ============================================================================
// Auto-conserto das rotas ligadas.
//
// Uma rota nao quebra de uma vez: ela apodrece. O lojista cadastra um produto
// na mao no Shopify, ele nasce sem SKU e fica fora do mapa; ninguem percebe
// porque a vitrine continua vendendo — so que pelo checkout errado. Foi assim
// que uma conta chegou a 27% de cobertura sem nenhum alarme.
//
// Este job roda de hora em hora e passa o mesmo conserto que o botao "Corrigir"
// faz, comecando pelas rotas ha mais tempo sem revisao.
// ============================================================================

// Cada rota le o catalogo inteiro das duas lojas. Poucas por execucao, para
// caber nos 300s da funcao — com o rodizio por last_healed_at, uma loja com 20
// rotas fecha o ciclo em menos de um dia.
const ROTAS_POR_EXECUCAO = 4;

function segredoDoCron() {
  return process.env.CRON_SECRET || process.env.BULK_IMPORT_CRON_SECRET || "";
}

function cronAutorizado(request: NextRequest) {
  const esperado = segredoDoCron();
  if (!esperado) return false;
  return (
    request.headers.get("authorization") === `Bearer ${esperado}` ||
    request.headers.get("x-cron-secret") === esperado
  );
}

async function executar(request: NextRequest) {
  const isCron = cronAutorizado(request);

  // Sem segredo de cron: exige sessao e so mexe nas rotas do proprio usuario.
  let userId: string | undefined;
  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const limite = Math.min(
    Math.max(
      Number(request.nextUrl.searchParams.get("limit") || ROTAS_POR_EXECUCAO),
      1
    ),
    10
  );

  const admin = createAdminClient();
  let query = admin
    .from("routed_checkout_configs")
    .select("id, name, user_id, last_healed_at")
    .eq("enabled", true)
    // nullsFirst: rota nunca revisada tem prioridade sobre a revisada ontem.
    .order("last_healed_at", { ascending: true, nullsFirst: true })
    .limit(limite);
  if (userId) query = query.eq("user_id", userId);

  const { data: rotas, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Falha ao listar rotas." },
      { status: 500 }
    );
  }

  const resultados: Record<string, unknown>[] = [];
  for (const rota of rotas || []) {
    try {
      const r = await healRoute({
        routeId: rota.id,
        origin: request.nextUrl.origin,
      });
      resultados.push({
        routeId: rota.id,
        name: rota.name,
        ...(r.noop
          ? { noop: true }
          : {
              stampedSkuCount: r.stampedSkuCount,
              dedupedSkuCount: r.dedupedSkuCount,
              fixedWrongCount: r.fixedWrongCount,
              extendedCount: r.extendedCount,
              createdProductCount: r.createdProductCount,
              imageQueueCount: r.imageQueueCount,
            }),
      });
    } catch (erro) {
      // Uma rota quebrada (loja desconectada, token expirado) nao pode impedir
      // o conserto das outras.
      const msg =
        erro instanceof HealRouteError || erro instanceof Error
          ? erro.message
          : "erro desconhecido";
      resultados.push({ routeId: rota.id, name: rota.name, error: msg });
      // Marca a tentativa para a rota nao travar o rodizio para sempre.
      await admin
        .from("routed_checkout_configs")
        .update({ last_healed_at: new Date().toISOString() })
        .eq("id", rota.id);
    }
  }

  const consertadas = resultados.filter((r) => !r.noop && !r.error).length;
  return NextResponse.json({
    checked: resultados.length,
    repaired: consertadas,
    results: resultados,
  });
}

export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
