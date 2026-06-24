import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const publicPaths = [
    "/api/health",
    "/api/checkout-routes/resolve",
    "/api/jobs/bulk-import/process",
    "/routed-checkout-loader.js",
  ];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/callback") &&
    !publicPaths.some((publicPath) => pathname.startsWith(publicPath))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Roteamento por host: o painel admin vive num subdominio separado
  // (ex.: adm.xcart.app). Detecta automaticamente qualquer host "adm." (ou o
  // ADMIN_HOST configurado). Em localhost a separacao fica off (testavel).
  const host = request.headers.get("host") || "";
  const adminHost = process.env.ADMIN_HOST || "";
  const isAdminHost = host.startsWith("adm.") || (!!adminHost && host === adminHost);

  if (isAdminHost) {
    // No subdominio admin so existe o painel: tudo que nao for admin/api/auth
    // e redirecionado para /admin (nao mostra o app do cliente).
    if (
      user &&
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/callback") &&
      !pathname.startsWith("/set-password")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  } else if (adminHost && pathname.startsWith("/admin")) {
    // No host principal (quando ja existe subdominio dedicado), bloqueia /admin.
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user) {
    const hasPassword = user.user_metadata?.has_password === true;
    if (
      !hasPassword &&
      !pathname.startsWith("/set-password") &&
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/callback") &&
      !pathname.startsWith("/login")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/set-password";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
