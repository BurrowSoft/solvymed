import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { routeAfterAuth } from "@/lib/authRouting";
import { localeFromAcceptLanguage, matchLocaleTag } from "@/lib/localeDetect";
import { GOOGLE_RETURN_PARAM, onboardingPending, parseGoogleRole } from "@/lib/googleSignIn";
import { parseCountryChoice } from "@/lib/signupCountry";
import { OAUTH_SIGN_IN } from "@/lib/firstConfirmation";
import { demoCountServer } from "@/lib/demoMetricsServer";
import { RETURN_COOKIE, returnFromCookie, withReturn } from "@/lib/authReturn";
import { GOOGLE_FAILED_PARAM, GOOGLE_FAILED_VALUE } from "@/lib/authFunnel";
import { authFunnelCount } from "@/lib/authFunnelServer";

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

  // Back from our Google button (232): ?google=signup|login.
  const fromGoogle = searchParams.get("google") === "signup" || searchParams.get("google") === "login";
  // A Google round trip that didn't finish (no session at the end): the sign-in page
  // says so and offers both ways again (funnel fix (a), 01's line), instead of an
  // empty sign-in page. Reported by its code only (never the person), and counted
  // as a daily total (lib/authFunnel).
  const googleFailed = async (code: string) => {
    Sentry.captureMessage("google_exchange_failed", { level: "warning", tags: { code: code.slice(0, 40) } });
    await authFunnelCount("google_exchange_failed", parseCountryChoice(searchParams.get("c")), locale);
    const url = new URL(`${localePrefix}/auth/login`, origin);
    url.searchParams.set(GOOGLE_FAILED_PARAM, GOOGLE_FAILED_VALUE);
    // A Patient Channel notice's page (lib/authReturn) stays the sign-in page's ?next=, so
    // trying again (either way) still returns there.
    const back = returnFromCookie(request.cookies.get(RETURN_COOKIE)?.value);
    if (back) url.searchParams.set("next", back);
    return url;
  };

  // Must have either a PKCE code or an OTP token_hash
  if (!code && !tokenHash) {
    // Google (or Supabase) sent the visitor back with ?error= instead of a code.
    const oauthError = searchParams.get("error");
    if (fromGoogle && oauthError) {
      const res = NextResponse.redirect(await googleFailed(oauthError));
      if (request.cookies.has(RETURN_COOKIE)) res.cookies.delete(RETURN_COOKIE);
      return pinLocale(res);
    }
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
  let redirectUrl = new URL(`${localePrefix}/auth/login`, origin);
  if (!error && data.session && data.user) {
    // Back from our Google button (232): a new Google account completes it
    // first ("Complete your account", with the country and role the page
    // had); an existing one goes where a sign-in goes. gr= reports which.
    // Fail safe: an error is "not pending" (the usual routing).
    if (fromGoogle && (await onboardingPending(supabase))) {
      redirectUrl = new URL(`${localePrefix}/auth/complete-account`, origin);
      const c = parseCountryChoice(searchParams.get("c"));
      if (c) redirectUrl.searchParams.set("c", c);
      const role = parseGoogleRole(searchParams.get("role"));
      if (role) redirectUrl.searchParams.set("role", role);
      redirectUrl.searchParams.set(GOOGLE_RETURN_PARAM, "new");
      // A NEW account from the demo's Google button: 238's signup_from_demo (a daily
      // total; nothing stored; a no-op while demo_metrics is off). E-mail sign-ups from
      // the demo aren't counted (01, 10-26: no account marker without consent).
      if (searchParams.get("via") === "demo") await demoCountServer("signup_from_demo", c ?? "??", locale);
    } else {
      // An existing account back from Google: a sign-in, never the welcome.
      const dest = await routeAfterAuth(supabase, data.user, localePrefix, fromGoogle ? OAUTH_SIGN_IN : type);
      // Signed in with Google from a Patient Channel notice's link (the sign-in page's
      // ?next=, checked again here): back to that page where it fits (lib/authReturn).
      const back = fromGoogle ? withReturn(dest, returnFromCookie(request.cookies.get(RETURN_COOKIE)?.value)) : dest;
      redirectUrl = new URL(back, origin);
      if (fromGoogle && back === dest) redirectUrl.searchParams.set(GOOGLE_RETURN_PARAM, "existing");
    }
  } else if (fromGoogle) {
    // E.g. the code verifier cookie is missing (the round trip ended in another
    // browser or app) or the code was already used.
    redirectUrl = await googleFailed((error as { code?: string } | null)?.code ?? (error ? "exchange_error" : "no_session"));
  }

  const response = NextResponse.redirect(redirectUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingCookies.forEach(({ name, value, ...rest }) => response.cookies.set(name, value, rest as any));
  // Used once (or never): a later sign-in must not reuse it.
  if (request.cookies.has(RETURN_COOKIE)) response.cookies.delete(RETURN_COOKIE);
  return pinLocale(response);
}
