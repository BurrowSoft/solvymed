"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { publicFlag } from "@/lib/publicFlags";
import { googleRedirectTo, startGoogleSignIn, type GoogleRole, type GoogleSource } from "@/lib/googleSignIn";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";

// "Continuar com Google" (specs/google-sign-in.md). Google's sign-in button
// rules: white, the official multi-colour G, "Continue with Google" wording.
// Nothing renders until the public switch google_signin is on (232), so the
// page is unchanged while it's off; an "ou" divider follows the button.
export function GoogleSignInButton({
  locale,
  source,
  country = null,
  role = null,
}: {
  locale: string;
  source: GoogleSource;
  country?: CountryChoice | null;
  role?: GoogleRole | null;
}) {
  const t = useTranslations("auth.google");
  const [on, setOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void publicFlag(createClient(), "google_signin").then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);

  if (!on) return null;

  async function go() {
    if (working) return;
    setWorking(true);
    setFailed(false);
    track("signup_google_start", { source });
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
