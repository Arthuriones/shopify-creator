import { NextRequest, NextResponse } from "next/server";
import { processBulkImportJobs } from "@/lib/jobs/bulk-import-processor";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function getConfiguredCronSecret() {
  return process.env.CRON_SECRET || process.env.BULK_IMPORT_CRON_SECRET || "";
}

function isAuthorizedCron(request: NextRequest) {
  const configuredSecret = getConfiguredCronSecret();
  if (!configuredSecret) return false;

  const authorization = request.headers.get("authorization");
  const legacySecret = request.headers.get("x-cron-secret");

  return (
    authorization === `Bearer ${configuredSecret}` ||
    legacySecret === configuredSecret
  );
}

async function processRequest(request: NextRequest, method: "GET" | "POST") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isCron = isAuthorizedCron(request);

  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = method === "POST" ? await request.json().catch(() => ({})) : {};
  const storeId =
    typeof body.storeId === "string"
      ? body.storeId
      : request.nextUrl.searchParams.get("storeId") || undefined;
  const limit = Math.min(
    Math.max(
      Number(body.limit || request.nextUrl.searchParams.get("limit") || 3),
      1
    ),
    10
  );

  const summary = await processBulkImportJobs({
    userId: isCron ? undefined : user?.id,
    storeId,
    limit,
  });

  return NextResponse.json({ summary });
}

export async function GET(request: NextRequest) {
  return processRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return processRequest(request, "POST");
}
