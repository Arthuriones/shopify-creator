import { NextRequest, NextResponse } from "next/server";
import { generateImageEditPrompt } from "@/lib/gemini/client";
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

  const { imageUrl, productTitle, storeId } = await request.json();

  if (!imageUrl || !productTitle) {
    return NextResponse.json(
      { error: "imageUrl and productTitle are required" },
      { status: 400 }
    );
  }

  // StoreContext é opcional para image prompts
  const context = storeId ? await getStoreContext(storeId, user.id) : undefined;

  try {
    const prompt = await generateImageEditPrompt(imageUrl, productTitle, context || undefined);
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("[ai/image-prompt] Error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar prompt de imagem" },
      { status: 500 }
    );
  }
}
