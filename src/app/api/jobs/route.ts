import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { BackgroundJob } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing job ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, storeId, payload } = await request.json();

  if (!type || !storeId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Create the job record in DB
  const { data: job, error: insertError } = await supabase
    .from("background_jobs")
    .insert({
      user_id: user.id,
      store_id: storeId,
      type,
      status: "pending"
    })
    .select()
    .single();

  if (insertError || !job) {
    return NextResponse.json({ error: "Failed to create job record" }, { status: 500 });
  }

  // Dispatch to Inngest
  let eventName = "";
  if (type === "optimize") eventName = "ai/optimize.product";
  else if (type === "remove_logo") eventName = "ai/remove.logo";
  else if (type === "apply_logo") eventName = "image/apply.logo";
  else if (type === "publish") eventName = "shopify/publish";
  else if (type === "bulk_import") eventName = "product/bulk.import";

  try {
    await inngest.send({
      name: eventName,
      data: {
        jobId: job.id,
        storeId,
        userId: user.id,
        ...payload
      }
    });

    return NextResponse.json({ job });
  } catch (err) {
    // If dispatch fails, update job to failed
    await supabase.from("background_jobs").update({ status: "failed", error: "Failed to queue job" }).eq("id", job.id);
    return NextResponse.json({ error: "Failed to dispatch job" }, { status: 500 });
  }
}
