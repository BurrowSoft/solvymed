"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { publicFlag } from "@/lib/publicFlags";
import { GOOGLE_TEST_PARAM, googleRedirectTo, startGoogleSignIn, type GoogleRole, type GoogleSource } from "@/lib/googleSignIn";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { RETURN_COOKIE, returnPath } from "@/lib/authReturn";
import { isInAppBrowser } from "@/lib/authFunnel";

// "Continuar com Google" (specs/google-sign-in.md). Google's sign-in button
// rules: white, the official multi-colour G, "Continue with Google" wording.
// Nothing renders until the public switch google_signin is on (232), so the
// page is unchanged while it's off; an "ou" divider follows the button.
export function GoogleSignInButton({
  locale,
  source,
  country = null,
  role = null,
  returnTo = null,
}: {
  locale: string;
  source: GoogleSource;
  country?: CountryChoice | null;
  role?: GoogleRole | null;
  // The sign-in page's ?next= (lib/authReturn): only a checked return page goes through
  // Google's round trip, in a short cookie the callback reads and clears.
  returnTo?: string | null;
}) {
  const t = useTranslations("auth.google");
  const [on, setOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  // Google refuses sign-in in Instagram's, Facebook's and LINE's own browsers (funnel
  // fix (b)): there, how to open the page in the phone's browser instead of the button.
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setInApp(isInAppBrowser(navigator.userAgent));
    // The test window (01): with the Supabase provider on and the switch
    // still off, ?google_test=1 shows the button for the tester's round
    // trips. Safe by 232: any Google sign-up waits for "Complete your
    // account"; with the provider off, Google refuses the sign-in.
    if (new URLSearchParams(location.search).get(GOOGLE_TEST_PARAM) === "1") {
      setOn(true);
      return;
    }
    void publicFlag(createClient(), "google_signin").then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);

  if (!on) return null;

  if (inApp) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        setCopied(true);
      } catch {
        // No clipboard here: the how-to above still works.
      }
    };
    return (
      <div className="mb-5">
        <div data-testid="google-in-app" data-source={source} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
          <p className="font-bold text-slate-900">{t("inApp.title")}</p>
          <p className="mt-1">{t("inApp.body")}</p>
          <button
            type="button"
            onClick={copy}
            data-testid="google-in-app-copy"
            className="mt-3 w-full rounded-xl border border-teal-200 bg-white px-4 py-2.5 font-semibold text-teal-700 transition hover:bg-teal-50"
          >
            {t("inApp.copy")}
          </button>
          <p role="status" aria-live="polite" className="mt-2 text-slate-600">{copied ? t("inApp.copied") : ""}</p>
        </div>
        <div className="mt-5 flex items-center gap-3 text-xs font-semibold uppercase text-slate-400" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />
          {t("or")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      </div>
    );
  }

  async function go() {
    if (working) return;
    setWorking(true);
    setFailed(false);
    track("signup_google_start", { source });
    const back = returnPath(returnTo);
    if (back) document.cookie = `${RETURN_COOKIE}=${encodeURIComponent(back)}; path=/; max-age=600; samesite=lax; secure`;
    const { error } = await startGoogleSignIn(createClient(), googleRedirectTo(location.origin, { locale, country, role, source }));
    if (error) {
      setWorking(false);
      setFailed(true);
    }
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        data-testid="google-signin"
        data-source={source}
        onClick={go}
        disabled={working}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#dadce0] bg-white px-6 py-3 text-base font-semibold text-[#1f1f1f] shadow-sm transition hover:bg-[#f8f9fa] disabled:opacity-60"
      >
        <GoogleG />
        {t("continue")}
      </button>
      {failed && <p role="alert" className="mt-2 text-sm text-red-600">{t("failed")}</p>}
      <div className="mt-5 flex items-center gap-3 text-xs font-semibold uppercase text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        {t("or")}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}

// Google's "G" logo, as published in its sign-in branding guidelines.
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
