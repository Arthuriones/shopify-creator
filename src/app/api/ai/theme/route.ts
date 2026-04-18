import { NextRequest, NextResponse } from "next/server";
import { suggestThemeImprovements } from "@/lib/gemini/client";
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

  const { storeId, currentTheme } = await request.json();

  if (!storeId || !currentTheme) {
    return NextResponse.json(
      { error: "storeId and currentTheme are required" },
      { status: 400 }
    );
  }

  const context = await getStoreContext(storeId, user.id);
  if (!context) {
    return NextResponse.json(
      { error: "Configure o perfil da loja antes de analisar o tema" },
      { status: 400 }
    );
  }

  try {
    const suggestions = await suggestThemeImprovements(context, currentTheme);
    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Theme analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
