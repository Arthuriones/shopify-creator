import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// pt e o locale padrao e nao tem prefixo na URL; os demais tem.
const PREFIXED_LOCALES = ["en", "ja"];

// A rota vive em /[locale]/callback, entao o locale esta no proprio pathname.
// Antes os redirects eram montados a partir do `origin` puro, o que descartava
// o prefixo: quem recuperava a senha em ingles ou japones caia no app em
// portugues.
function localePrefixFrom(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return PREFIXED_LOCALES.includes(first) ? `/${first}` : "";
}

export async function GET(request: Request) {
  const { searchParams, origin, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const prefix = localePrefixFrom(pathname);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}${prefix}/set-password`);
      }
      return NextResponse.redirect(`${origin}${prefix}/stores`);
    }
    // Link expirado/reutilizado: sinaliza o motivo em vez de devolver um
    // formulario de login em branco, sem explicacao nenhuma.
    return NextResponse.redirect(
      `${origin}${prefix}/login?error=link_invalido`
    );
  }

  return NextResponse.redirect(`${origin}${prefix}/login`);
}
