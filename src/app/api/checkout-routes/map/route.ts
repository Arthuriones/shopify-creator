import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deriveStoreRoles, type StoreRole } from "@/lib/checkout-routes/store-roles";

export const runtime = "nodejs";

interface TargetRow {
  id: string;
  route_id: string;
  target_store_id: string;
  weight: number | null;
  enabled: boolean | null;
  position: number | null;
  last_healed_at: string | null;
  sku_map: Record<string, unknown> | null;
}

/**
 * O grafo inteiro do usuario: lojas, rotas e destinos, num payload so.
 *
 * O mapa precisa de tudo junto para desenhar -- buscar rota por rota faria a
 * tela piscar em N requisicoes e ainda assim mostrar um estado inconsistente
 * no meio do caminho.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [storesResult, routesResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, shop_domain, target_language, logo_path, niche")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("routed_checkout_configs")
      .select(
        "id, name, enabled, mode, rotation, public_token, settings, source_store_id, target_store_id, sku_map, last_healed_at, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const stores = storesResult.data || [];
  const routes = routesResult.data || [];
  const routeIds = routes.map((route) => route.id);

  let targets: TargetRow[] = [];
  if (routeIds.length > 0) {
    const { data } = await supabase
      .from("routed_checkout_targets")
      .select("id, route_id, target_store_id, weight, enabled, position, last_healed_at, sku_map")
      .in("route_id", routeIds)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    targets = (data || []) as TargetRow[];
  }

  const byRoute = new Map<string, TargetRow[]>();
  for (const target of targets) {
    const list = byRoute.get(target.route_id) || [];
    list.push(target);
    byRoute.set(target.route_id, list);
  }

  const graphRoutes = routes.map((route) => {
    const rows = byRoute.get(route.id) || [];

    // Rota anterior a migracao 025 sem linha de destino (destino apagado a
    // mao): mostra o destino legado para o mapa nao desenhar uma rota solta.
    const effective: TargetRow[] =
      rows.length > 0
        ? rows
        : route.target_store_id
          ? [
              {
                id: `legacy:${route.id}`,
                route_id: route.id,
                target_store_id: route.target_store_id,
                weight: 1,
                enabled: true,
                position: 0,
                last_healed_at: route.last_healed_at,
                sku_map: route.sku_map,
              },
            ]
          : [];

    const totalWeight = effective
      .filter((t) => t.enabled !== false && (t.weight ?? 1) > 0)
      .reduce((sum, t) => sum + (t.weight ?? 1), 0);

    // Resultado da ultima passada do auto-conserto. E o unico sinal de saude
    // que existe sem o usuario pedir, entao o console mostra ele direto.
    const settings = (route.settings || {}) as {
      last_heal?: { at: string; ok: boolean; message?: string; mappedCount?: number };
    };

    return {
      id: route.id,
      name: route.name,
      enabled: route.enabled !== false,
      mode: route.mode,
      publicToken: route.public_token,
      lastHeal: settings.last_heal ?? null,
      sourceStoreId: route.source_store_id,
      rotationStrategy:
        (route.rotation as { strategy?: string } | null)?.strategy === "each_checkout"
          ? "each_checkout"
          : "sticky",
      targets: effective.map((target) => {
        const weight = target.weight ?? 1;
        const active = target.enabled !== false && weight > 0;
        return {
          id: target.id,
          storeId: target.target_store_id,
          weight,
          enabled: target.enabled !== false,
          legacy: String(target.id).startsWith("legacy:"),
          mappedSkuCount: Object.keys(target.sku_map || {}).length,
          lastHealedAt: target.last_healed_at,
          sharePercent:
            active && totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0,
        };
      }),
    };
  });

  const roles = deriveStoreRoles(
    graphRoutes.map((route) => ({
      sourceStoreId: route.sourceStoreId,
      targetStoreIds: route.targets.map((t) => t.storeId),
    }))
  );

  return NextResponse.json({
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      shopDomain: store.shop_domain,
      targetLanguage: store.target_language,
      logoPath: store.logo_path,
      niche: store.niche,
      role: (roles.get(store.id) || "unassigned") as StoreRole,
    })),
    routes: graphRoutes,
  });
}
