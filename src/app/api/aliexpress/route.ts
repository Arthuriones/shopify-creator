import { NextRequest, NextResponse } from "next/server";
import { scrapeProduct } from "@/lib/aliexpress/scraper";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const product = await scrapeProduct(url);
    return NextResponse.json({ product });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to scrape product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
