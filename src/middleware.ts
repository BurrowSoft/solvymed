import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const COUNTRY_LOCALE: Record<string, string> = {
  TH: "th",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  UY: "es", PY: "es", BO: "es", EC: "es", CR: "es", PA: "es", DO: "es",
  GT: "es", HN: "es", SV: "es", NI: "es", CU: "es",
  BR: "pt-BR", PT: "pt-BR",
  FR: "fr", BE: "fr", CH: "fr", LU: "fr", MC: "fr",
  JP: "ja",
  CN: "zh",
  TW: "zh-TW", HK: "zh-TW", MO: "zh-TW",
  SA: "ar", AE: "ar", EG: "ar", KW: "ar", QA: "ar",
  BH: "ar", OM: "ar", JO: "ar", LB: "ar", MA: "ar",
  DZ: "ar", TN: "ar", LY: "ar", IQ: "ar", SY: "ar", YE: "ar",
  DE: "de", AT: "de",
  ID: "id",
  KR: "ko",
  IT: "it",
  VN: "vi",
  RU: "ru", UA: "ru", KZ: "ru", BY: "ru",
};

const intlMiddleware = createMiddleware(routing);

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Supabase session refresh
  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();

  // Protect dashboard
  if (pathname.includes("/dashboard") && !user) {
    const segments = pathname.split("/");
    const locale = (routing.locales as readonly string[]).includes(segments[1]) ? segments[1] : "en";
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, req.url));
  }

  // First-visit geo-redirect
  const hasLocalePrefix = (routing.locales as readonly string[]).some(
    (l) => l !== routing.defaultLocale && pathname.startsWith(`/${l}`)
  );
  const isApiOrAsset = /^\/(api|_next|favicon|.*\..*)/.test(pathname);
  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /googlebot|bingbot|yandexbot|baiduspider|applebot|facebookexternalhit|twitterbot/i.test(ua);

  if (!hasLocalePrefix && !isApiOrAsset && !req.cookies.has("NEXT_LOCALE") && !isBot) {
    const country =
      req.headers.get("x-vercel-ip-country") ??
      req.headers.get("cf-ipcountry") ??
      "US";
    const locale = COUNTRY_LOCALE[country] ?? "en";
    if (locale !== "en") {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}${pathname}`;
      const res = NextResponse.redirect(url, { status: 302 });
      res.cookies.set("NEXT_LOCALE", locale, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
      return res;
    }
  }

  // ?country=XX dev simulation
  const devCountry = searchParams.get("country");
  if (devCountry) {
    const intlRes = intlMiddleware(req);
    if (intlRes.status >= 300 && intlRes.status < 400) return intlRes;
    const newHeaders = new Headers(req.headers);
    newHeaders.set("x-burrowsoft-geo", devCountry.toUpperCase());
    const res = NextResponse.next({ request: { headers: newHeaders } });
    intlRes.headers.forEach((value, key) => {
      if (key === "set-cookie") res.headers.append(key, value);
    });
    return res;
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|.*\\..*).*)", "/"],
};
