import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/setup/status";

export const runtime = "nodejs";

// A sidebar precisa disto no cliente (progresso e contadores). A pagina de
// configuracao le a mesma funcao direto no servidor, sem passar por aqui.
export async function GET() {
  const status = await getSetupStatus();
  return NextResponse.json({
    percent: status.percent,
    nextLabel: status.nextLabel,
    storeCount: status.storeCount,
    credits: status.credits,
    routeActive: status.routeActive,
  });
}
