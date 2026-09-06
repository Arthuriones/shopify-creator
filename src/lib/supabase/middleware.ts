import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { APP_HOME } from "@/lib/app-home";

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

function localeOf(pathname: string): "pt" | "en" | "ja" {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  if (pathname === "/ja" || pathname.startsWith("/ja/")) return "ja";
  return "pt";
}

// PT e o default (sem prefixo); demais idiomas ganham /<locale>.
function prefixOf(locale: "pt" | "en" | "ja"): string {
  return locale === "pt" ? "" : `/${locale}`;
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

  // Arquivos estaticos (loaders .js, .html publicos, etc.) servem crus — NUNCA
  // passam por i18n nem auth, senao o next-intl prefixa locale e quebra
  // (ex.: /routed-checkout-loader.js, /reviews-widget-loader.js).
  if (!isApi && /\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next({ request });
  }

  // ===== HOST COMERCIAL (landing publica, com i18n) =====
  if (isMarketingHost) {
    if (isApi) return NextResponse.next({ request });
    const locale = localeOf(pathname);
    const localePrefix = prefixOf(locale);
    const bare = localePrefix
      ? pathname.slice(localePrefix.length) || "/"
      : pathname;
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

  // ===== HOST ADMIN =====
  // O painel (/admin) vive FORA de [locale], entao nao pode passar pelo
  // next-intl. Ja as telas de auth (/login, /callback, /set-password) vivem em
  // src/app/[locale]/(auth)/ e SO resolvem com o rewrite de locale. Sem ele,
  // "/login" caia em /[locale] com locale="login", o layout chamava notFound()
  // e o admin ficava inacessivel (404 na tela de login).
  if (isAdminHost) {
    const isAdminAuthRoute =
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname.startsWith("/callback") ||
      pathname.startsWith("/set-password");
    const response = isAdminAuthRoute
      ? intlMiddleware(request)
      : NextResponse.next({ request });
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
  // /admin so existe no subdominio adm.; no app manda pra home (roteamento).
  if (!isLocal && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = APP_HOME;
    return NextResponse.redirect(url);
  }

  // /api e /admin (local) nao passam por i18n.
  //
  // A rota de API autentica sozinha e devolve 401 -- este getUser() so servia
  // para renovar o cookie, e custava uma ida a rede em TODA chamada de API.
  // O app faz varias por tela, entao era o gasto mais repetido do sistema.
  // A renovacao continua acontecendo na navegacao de pagina, que passa pelo
  // ramo de baixo.
  if (isApi) {
    return NextResponse.next({ request });
  }

  if (pathname.startsWith("/admin")) {
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
  const prefix = prefixOf(locale);
  const isAuthPath =
    pathname === `${prefix}/login` ||
    pathname.startsWith(`${prefix}/login`) ||
    pathname.startsWith(`${prefix}/callback`);

  if (!user && !isAuthPath && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    const intendedPath = `${pathname}${request.nextUrl.search}`;
    url.pathname = `${prefix}/login`;
    url.search = "";
    // Guarda o destino para o login devolver o usuario ao lugar certo depois de
    // entrar (ex.: link direto para /products ou instalacao da Shopify).
    url.searchParams.set("next", intendedPath);
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
    if (isAuthPath && !isSetPassword) {
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}${APP_HOME}`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}
