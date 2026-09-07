import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { getRouteGraph } from "@/lib/checkout-routes/graph";

export const runtime = "nodejs";

/**
 * O mesmo grafo que a pagina do roteamento monta no servidor.
 *
 * A pagina nao passa mais por aqui na primeira carga: esta rota existe para o
 * console recarregar depois de mexer em peso, destino ou rota.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getRouteGraph());
}
