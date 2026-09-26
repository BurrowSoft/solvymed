import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { routeAfterAuth } from "@/lib/authRouting";
import { localeFromAcceptLanguage, matchLocaleTag } from "@/lib/localeDetect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // No [locale] segment here (this is a Route Handler, not a page under
  // [locale]). The signup form puts its locale on the confirmation link
  // (?locale=), which survives opening the email in another browser, e.g.
  // a phone's mail app. Older links without it fall back to the NEXT_LOCALE
  // cookie next-intl's middleware keeps for this browser.
  const isLocale = (v: string | null | undefined): v is string =>
    (routing.locales as readonly string[]).includes(v ?? "");
  // ?locale= comes from the email template's user_metadata.locale: a route
  // code from web signups (pt-BR), or the app's own codes (fr-FR, de-DE…),
  // mapped to the route locale here. Empty or unknown values (older
  // accounts, a template's "<no value>") fall back to the browser. Language
  // only: it never decides anything else.
  const paramLocale = matchLocaleTag(searchParams.get("locale") ?? "", routing.locales);
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const locale = paramLocale
    ?? (isLocale(cookieLocale) ? cookieLocale : null)
    ?? localeFromAcceptLanguage(request.headers.get("accept-language"), routing.locales)
    ?? routing.defaultLocale;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  // Pin the language for this browser on every redirect from here. en pages
  // are unprefixed, and without the cookie the middleware's first-visit
  // geo-redirect would move a fresh browser to its country's locale.
  const pinLocale = (res: NextResponse) => {
    res.cookies.set("NEXT_LOCALE", locale, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
    return res;
  };

  // Must have either a PKCE code or an OTP token_hash
  if (!code && !tokenHash) {
    return pinLocale(NextResponse.redirect(new URL(localePrefix || "/", origin)));
  }

  // A one-time token link (token_hash) is never verified on GET: mail
  // scanners (e.g. Outlook Safe Links) open links before the person does,
  // and verifying here would burn the token so the real click fails. The
  // verify page asks for a click (or, for a password reset, the new
  // password) and verifies only then.
  if (!code && tokenHash) {
    const verifyUrl = new URL(`${localePrefix}/auth/verify`, origin);
    verifyUrl.searchParams.set("token_hash", tokenHash);
    // Passed on as-is: the verify page whitelists it and never guesses one.
    if (type) verifyUrl.searchParams.set("type", type);
    const res = pinLocale(NextResponse.redirect(verifyUrl));
    // The token is in the URL: keep it out of the verify page's referrers.
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  // PKCE code: exchanging it needs this browser's code verifier cookie, so a
  // scanner can't use it up.
  // Collect cookies Supabase wants to set — we'll apply them to the final redirect response.
  // next/headers cookies() would NOT attach to a manually-created NextResponse,
  // so we buffer them and apply explicitly instead.
  const pendingCookies: Array<Record<string, unknown> & { name: string; value: string }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, ...(options ?? {}) });
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
  // Auth failed: login gives the user a clear path forward.
  const redirectUrl = !error && data.session && data.user
    ? new URL(await routeAfterAuth(supabase, data.user, localePrefix, type), origin)
    : new URL(`${localePrefix}/auth/login`, origin);

  const response = NextResponse.redirect(redirectUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingCookies.forEach(({ name, value, ...rest }) => response.cookies.set(name, value, rest as any));
  return pinLocale(response);
}
