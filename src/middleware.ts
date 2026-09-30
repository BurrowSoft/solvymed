import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isPublicLocale, publicLocales } from "@/lib/publicLocales";
import { routing } from "./i18n/routing";
import { canonicalLocalePath, pickLocale } from "./lib/localeDetect";

// Automatic language guesses (browser language, country, an /en/ link) are
// remembered for 30 days, so a wrong first guess doesn't stick for a year.
// An explicit pick in the language switcher keeps its own 1-year cookie.
const AUTO_LOCALE_MAX_AGE = 60 * 60 * 24 * 30;

const intlMiddleware = createMiddleware(routing);

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // /pt/… and odd casing (/pt-br/…, /zh-tw/…) → the real locale prefix.
  const canonical = canonicalLocalePath(pathname, routing.locales);
  if (canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, { status: 308 });
  }

  // Supabase session refresh. The refreshed auth cookies must reach the
  // browser on whichever response this middleware finally returns (the
  // next-intl response, a redirect…), not on a response that's thrown away,
  // or a rotated refresh token is never saved and the session can drop.
  const refreshedCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          // Also visible to the rest of this request (server components).
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          refreshedCookies.push(...cookiesToSet);
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const withAuthCookies = (res: NextResponse) => {
    refreshedCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  };

  // Protect dashboard
  if (pathname.includes("/dashboard") && !user) {
    const segments = pathname.split("/");
    const locale = (routing.locales as readonly string[]).includes(segments[1]) ? segments[1] : "en";
    return withAuthCookies(NextResponse.redirect(new URL(`/${locale}/auth/login`, req.url)));
  }

  // First-visit geo-redirect. Only for paths with no locale segment at all:
  // an explicit /en/... (the default locale, e.g. from an email link) must
  // not get a second prefix (/th/en/... is a 404). Matching the whole first
  // segment also stops /id from matching paths like /identity.
  const firstSegment = pathname.split("/")[1] ?? "";
  const hasLocalePrefix = (routing.locales as readonly string[]).includes(firstSegment);
  const isApiOrAsset = /^\/(api|_next|favicon|.*\..*)/.test(pathname);

  // A language that isn't offered yet (Thai before its release): /th/...
  // redirects to the same page without the prefix, keeping the query (an
  // auth link sent with locale=th still works, in English).
  // A NEXT_LOCALE cookie can hold such a language (picked in an older
  // switcher, or auto-detected before it was hidden). next-intl would keep
  // sending that visitor to /th and the redirect here back, forever, so the
  // cookie counts as missing and is dropped on the redirect.
  const cookieLocale = req.cookies.get("NEXT_LOCALE")?.value;
  const hiddenCookie = !!cookieLocale && !isPublicLocale(cookieLocale);
  if (hasLocalePrefix && !isPublicLocale(firstSegment)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(firstSegment.length + 1) || "/";
    const res = withAuthCookies(NextResponse.redirect(url, { status: 307 }));
    if (hiddenCookie) res.cookies.delete("NEXT_LOCALE");
    return res;
  }
  // Invite and join URLs carry personal codes (and, in old secretary links,
  // an email): never index them, whatever the page's own metadata says.
  // The signup and login pages they hand off to carry the same data in the
  // query string (?secretary=, ?join=, ?email=, ?next=).
  const isPersonalLink =
    /^(?:\/[A-Za-z-]+)?\/(?:invite|join)(?:\/|$)/.test(pathname) ||
    (/^(?:\/[A-Za-z-]+)?\/auth\/(?:signup|login)$/.test(pathname) &&
      ["secretary", "join", "email", "next"].some((k) => searchParams.has(k)));
  // Applied to every response below.
  const finalize = (res: NextResponse) => {
    withAuthCookies(res);
    if (isPersonalLink) res.headers.set("X-Robots-Tag", "noindex, nofollow");
    // An explicit /en/... is a language choice (e.g. an email link).
    // next-intl strips it to the unprefixed URL but only writes NEXT_LOCALE
    // when the browser's language differs, so without this a fresh browser
    // would hit the geo-redirect on the next request and lose English.
    if (firstSegment === routing.defaultLocale) {
      res.cookies.set("NEXT_LOCALE", routing.defaultLocale, { maxAge: AUTO_LOCALE_MAX_AGE, path: "/", sameSite: "lax" });
    }
    return res;
  };
  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /googlebot|bingbot|yandexbot|baiduspider|applebot|facebookexternalhit|twitterbot/i.test(ua);

  // First visit to an unprefixed URL: the browser's language wins when we
  // support it; the country is only the fallback (lib/localeDetect).
  // A cookie holding a hidden language counts as no cookie (see above).
  if (!hasLocalePrefix && !isApiOrAsset && (!req.cookies.has("NEXT_LOCALE") || hiddenCookie) && !isBot) {
    const locale = pickLocale({
      acceptLanguage: req.headers.get("accept-language"),
      country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry"),
      // Only offered languages: a Thai browser or TH visitor isn't sent
      // to /th before the Thai release.
      supported: publicLocales(),
      defaultLocale: routing.defaultLocale,
    });
    if (locale !== routing.defaultLocale) {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
      const res = NextResponse.redirect(url, { status: 302 });
      res.cookies.set("NEXT_LOCALE", locale, { maxAge: AUTO_LOCALE_MAX_AGE, path: "/", sameSite: "lax" });
      return finalize(res);
    }
    // English: no redirect (en is unprefixed), but pin it so next-intl's
    // own negotiation agrees on the next request. next-intl negotiates
    // Accept-Language itself on this request, which could still pick a
    // hidden language (Thai before its release), so it sees our choice.
    // The rebuilt request keeps the URL and headers only (no method/body):
    // fine here, since this branch only handles first-visit page loads
    // (GETs without a usable locale cookie). A hidden-language cookie is
    // removed from the rebuilt request too, or next-intl would still
    // redirect to it.
    const headers = new Headers(req.headers);
    headers.set("accept-language", routing.defaultLocale);
    const pinned = new NextRequest(req.url, { headers });
    pinned.cookies.delete("NEXT_LOCALE");
    const res = finalize(intlMiddleware(pinned));
    res.cookies.set("NEXT_LOCALE", routing.defaultLocale, { maxAge: AUTO_LOCALE_MAX_AGE, path: "/", sameSite: "lax" });
    return res;
  }

  // ?country=XX dev simulation
  const devCountry = searchParams.get("country");
  if (devCountry) {
    const intlRes = intlMiddleware(req);
    if (intlRes.status >= 300 && intlRes.status < 400) return finalize(intlRes);
    const newHeaders = new Headers(req.headers);
    newHeaders.set("x-burrowsoft-geo", devCountry.toUpperCase());
    const res = NextResponse.next({ request: { headers: newHeaders } });
    intlRes.headers.forEach((value, key) => {
      if (key === "set-cookie") res.headers.append(key, value);
    });
    return finalize(res);
  }

  return finalize(intlMiddleware(req));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|.*\\..*).*)", "/"],
};
