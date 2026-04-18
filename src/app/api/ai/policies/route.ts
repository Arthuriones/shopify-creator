import { NextRequest, NextResponse } from "next/server";
import { generateStorePolicies } from "@/lib/gemini/client";
import { createClient } from "@/lib/supabase/server";
import { getStoreContext } from "@/lib/store-context";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeId } = await request.json();

  if (!storeId) {
    return NextResponse.json(
      { error: "storeId is required" },
      { status: 400 }
    );
  }

  const context = await getStoreContext(storeId, user.id);
  if (!context) {
    return NextResponse.json(
      { error: "Configure o perfil da loja antes de gerar políticas (nicho obrigatório)" },
      { status: 400 }
    );
  }

  try {
    const policies = await generateStorePolicies(context);
    return NextResponse.json({ policies });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Policy generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
