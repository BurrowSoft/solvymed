"use client";

import { useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";
import { TurnstileWidget, turnstileEnabled } from "@/components/TurnstileWidget";
import { useAuthErrorText } from "@/lib/useAuthErrorText";
import { OpenInApp } from "@/components/OpenInApp";
import { SIGNUP_COUNTRY_COOKIE } from "@/lib/signupCountry";
import { conditionMet } from "@/lib/conditions";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

export default function LoginPage() {
  const t = useTranslations("auth");
  const authErrorText = useAuthErrorText();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // One submit at a time: a double-click lands before the disabled button
  // re-renders (Vitor 1.4.0).
  const submitting = useRef(false);
  // Bot protection (dormant until a Turnstile site key is configured).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The fields are uncontrolled and read from the form itself. Controlled
    // ones held React's copy, and any re-render (a keystroke in the other
    // field, setError, hydration on a slow load) wrote that copy back: an
    // email autofilled by a password manager, or typed before hydration,
    // was emptied and the sign-in failed (e7; 3e on #332).
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError("");
    if (turnstileEnabled && !captchaToken) {
      setError(t("captchaFailed"));
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    // A signup's country pick is for the account created here, not for
    // whoever signs in next on this browser (9a).
    document.cookie = `${SIGNUP_COUNTRY_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setLoading(true);
    const supabase = createClient();
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    // A token is single-use: get a fresh one for the next attempt.
    if (turnstileEnabled) setCaptchaReset((n) => n + 1);
    // The button keeps its spinner until the next page replaces this one
    // (Vitor 1.4.0: it flipped back to "Sign in" while the dashboard loaded);
    // only an error resets it.
    if (authError || !signInData.user) {
      submitting.current = false;
      setLoading(false);
    }
    // Vitor, build 25 item 11: a patient who signed up in the APP with an
    // invite code and then signs in here was asked for the code again. The
    // code saved at signup is tried once, only while the account has no role
    // row yet (as the app's autoLinkPatient), with connect_with_code
    // (personal, then public; the server's rules apply). Only misses count
    // toward 147's limit. null = not linked: the usual invite form.
    async function linkStoredCode(meta: Record<string, unknown> | undefined): Promise<string | null> {
      const code = typeof meta?.invite_code === "string" ? meta.invite_code.trim().toUpperCase() : "";
      if (!code || !conditionMet("invite-connect-live")) return null;
      const { data: kind, error } = await supabase.rpc("connect_with_code", { p_code: code });
      if (error) return null;
      if (kind === "personal") return localePath("/my-appointments");
      if (kind === "public") return localePath("/auth/pending-confirmation");
      return null;
    }

    if (authError) {
      setError(authErrorText(authError) ?? t("errors.generic"));
    } else if (signInData.user) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role, invited_by_professional_id, linked_patient_id")
        .eq("user_id", signInData.user.id)
        .maybeSingle();
      const metaRole = signInData.user.user_metadata?.role as string | undefined;
      let dest: string;
      if (roleRow?.role === "patient" && roleRow.linked_patient_id) {
        dest = localePath("/my-appointments");
      } else if (roleRow?.role === "patient" && roleRow.invited_by_professional_id) {
        // Linked to a doctor's "orbit" but not yet confirmed.
        dest = localePath("/auth/pending-confirmation");
      } else if (roleRow?.role === "patient") {
        // Neither (removed by the clinic, 147): connect to a doctor (e7).
        // The stored code is never re-used once a role row exists (as the
        // app's autoLinkPatient: a code isn't "re-burned").
        dest = localePath("/auth/invite-required");
      } else if (roleRow?.role === "professional") {
        // An ended trial / failed renewal: the paywall first, never Home or
        // the tour (Vitor, build 25). The dashboard re-checks it anyway.
        const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: signInData.user.id });
        const sub = (Array.isArray(subRows) ? subRows[0] ?? null : null) as EffectiveSub | null;
        dest = localePath(sub && !isAccessAllowed(sub) ? "/subscribe" : "/dashboard");
      } else if (roleRow?.role) {
        dest = localePath("/dashboard");
      } else if (metaRole === "patient") {
        // No persisted role but signed up intending to be a patient: try the
        // code from the signup once; else the retry form, not /dashboard.
        dest = (await linkStoredCode(signInData.user.user_metadata)) ?? localePath("/auth/invite-required");
      } else {
        dest = localePath("/dashboard");
      }
      // A secretary invite link sends signed-out visitors here with
      // ?next=<that invite>. Only that exact shape is honored, never an
      // arbitrary URL, so this can't become an open redirect.
      const next = searchParams.get("next");
      if (next && /^(\/[a-zA-Z-]{2,5})?\/join\/secretary\/S-[A-Z0-9]+$/.test(next)) dest = next;
      router.push(dest);
      router.refresh();
    }
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <OpenInApp />
        {/* Back to home */}
        <div className="mb-6">
          <Link
            href={localePath("/")}
            className="back-link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {t("backToHome")}
          </Link>
        </div>

        <Logo />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">
          {t("login.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          {t("login.subtitle")}
        </p>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="field-label">
              {t("login.email")}
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              data-testid="login-email"
              className="text-input"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
              {t("login.password")}
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              data-testid="login-password"
              className="text-input"
            />
          </div>

          <TurnstileWidget onToken={setCaptchaToken} locale={locale} resetKey={captchaReset} />

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("login.submit")}
              </span>
            ) : (
              t("login.submit")
            )}
          </button>
          {/* After "Entrar", so Tab goes email → password → Entrar (Vitor,
              build 25: from the email it used to land here first). */}
          <div className="text-center">
            <Link
              href={localePath("/auth/forgot-password")}
              data-testid="login-forgot"
              className="text-sm text-teal-600 hover:underline"
            >
              {t("login.forgotPassword")}
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {t("login.noAccount")}{" "}
          <Link
            href={localePath("/auth/signup")}
            className="font-semibold text-teal-600 hover:underline"
          >
            {t("login.signUp")}
          </Link>
        </p>
      </AuthCard>

      <p className="auth-footer-text">
        SolvyMed by{" "}
        <Link href={localePath("/")} className="link-teal">
          BurrowSoft
        </Link>
      </p>
    </AuthPageShell>
  );
}
