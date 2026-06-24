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

  // ----- Roteamento por host (3 dominios, 1 deploy) -----
  // xcart.app           -> landing comercial (publica, sem login)
  // user.xcart.app      -> o app (sistema de acesso)
  // adm.xcart.app       -> painel admin
  // localhost / *.vercel.app -> app completo (dev/preview)
  const host = request.headers.get("host") || "";
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.endsWith(".vercel.app");
  const isAdminHost = host.startsWith("adm.");
  const isAppHost = host.startsWith("user.");
  const isMarketingHost = !isLocal && !isAdminHost && !isAppHost;

  // Origem do app para mandar quem cair no host comercial em rota do sistema.
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://user.${host.replace(/^www\./, "")}`;

  if (isMarketingHost) {
    // APIs passam direto (o webhook do Stripe vive em xcart.app/api/...).
    if (pathname.startsWith("/api")) {
      return NextResponse.next({ request });
    }
    // Paginas publicas servidas no host comercial.
    const marketingPaths = [
      "/lp",
      "/privacy",
      "/terms",
      "/data-deletion",
      "/user-data-deletion",
      "/routed-checkout-loader.js",
    ];
    if (
      marketingPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      return NextResponse.next({ request });
    }
    if (pathname === "/") {
      // Callback de install da Shopify pode bater na raiz: manda pro app.
      if (/[?&](shop|code|hmac|host|state)=/.test(request.nextUrl.search)) {
        return NextResponse.redirect(
          new URL(`/${request.nextUrl.search}`, appOrigin)
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/lp";
      return NextResponse.rewrite(url);
    }
    // Qualquer rota do app no host comercial -> subdominio do app.
    return NextResponse.redirect(
      new URL(pathname + request.nextUrl.search, appOrigin)
    );
  }

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

  // Painel admin vive em adm.xcart.app. Em localhost/*.vercel.app a separacao
  // fica off (admin acessivel pra testar).
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
  } else if (!isLocal && pathname.startsWith("/admin")) {
    // No host do app (user.xcart.app), bloqueia /admin -> manda pro dashboard.
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
