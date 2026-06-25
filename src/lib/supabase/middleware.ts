import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = [
  "/api/health",
  "/api/checkout-routes/resolve",
  "/api/jobs/bulk-import/process",
  "/routed-checkout-loader.js",
];

// Liga o Supabase ao par request/response sem recriar a response — assim a
// resposta do next-intl (rewrite de locale) e preservada e os cookies de
// sessao sao atualizados em cima dela.
function attachSupabase(request: NextRequest, response: NextResponse) {
  return createServerClient(
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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
}

function localeOf(pathname: string): "pt" | "en" {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "pt";
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") || "";
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.endsWith(".vercel.app");
  const isAdminHost = host.startsWith("adm.");
  const isAppHost = host.startsWith("user.");
  const isMarketingHost = !isLocal && !isAdminHost && !isAppHost;
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://user.${host.replace(/^www\./, "")}`;
  const isApi = pathname.startsWith("/api");

  // ===== HOST COMERCIAL (landing publica, com i18n) =====
  if (isMarketingHost) {
    if (isApi) return NextResponse.next({ request });
    const locale = localeOf(pathname);
    const bare =
      locale === "en" ? pathname.replace(/^\/en/, "") || "/" : pathname;
    const marketingBare = [
      "/",
      "/lp",
      "/privacy",
      "/terms",
      "/data-deletion",
      "/user-data-deletion",
    ];
    const isMarketingPath =
      marketingBare.some((p) => bare === p || bare.startsWith(p + "/")) ||
      bare.startsWith("/routed-checkout-loader.js");
    if (!isMarketingPath) {
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, appOrigin)
      );
    }
    return intlMiddleware(request);
  }

  // ===== HOST ADMIN (sem i18n) =====
  if (isAdminHost) {
    const response = NextResponse.next({ request });
    const supabase = attachSupabase(request, response);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (
      !user &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/callback") &&
      !isPublic(pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (
      user &&
      !pathname.startsWith("/admin") &&
      !isApi &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/callback") &&
      !pathname.startsWith("/set-password")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // ===== HOST DO APP (ou local) =====
  // /admin so existe no subdominio adm.; no app manda pro dashboard.
  if (!isLocal && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // /api e /admin (local) nao passam por i18n; api faz auth proprio (401).
  if (isApi || pathname.startsWith("/admin")) {
    const response = NextResponse.next({ request });
    const supabase = attachSupabase(request, response);
    await supabase.auth.getUser();
    return response;
  }

  // ===== Paths localizados: i18n + auth =====
  const response = intlMiddleware(request);
  const supabase = attachSupabase(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = localeOf(pathname);
  const prefix = locale === "en" ? "/en" : "";
  const isAuthPath =
    pathname === `${prefix}/login` ||
    pathname.startsWith(`${prefix}/login`) ||
    pathname.startsWith(`${prefix}/callback`);

  if (!user && !isAuthPath && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/login`;
    return NextResponse.redirect(url);
  }

  if (user) {
    const hasPassword = user.user_metadata?.has_password === true;
    const isSetPassword = pathname.startsWith(`${prefix}/set-password`);
    if (!hasPassword && !isSetPassword && !isAuthPath) {
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}/set-password`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}
