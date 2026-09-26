"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";
import { TurnstileWidget, turnstileEnabled, isCaptchaError } from "@/components/TurnstileWidget";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bot protection (dormant until a Turnstile site key is configured).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (turnstileEnabled && !captchaToken) {
      setError(t("captchaFailed"));
      return;
    }
    setLoading(true);
    // Implicit flow for the recovery email only. The app's default browser
    // client uses PKCE, whose link returns ?code= that can only be
    // exchanged in the browser that asked (the verifier is stored there),
    // so a link opened in a phone's mail app would fail. Implicit links
    // return #access_token=…, which the reset page reads in any browser.
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      // Keep the user's language. The locale is explicit even for en, so a
      // fresh browser (no NEXT_LOCALE cookie) isn't geo-redirected elsewhere.
      { redirectTo: `https://www.solvymed.com/${locale}/auth/reset-password`, ...(captchaToken ? { captchaToken } : {}) }
    );
    setLoading(false);
    if (turnstileEnabled) setCaptchaReset((n) => n + 1);
    if (isCaptchaError(authError)) {
      setError(t("captchaFailed"));
    } else if (authError) {
      setError(t("forgotPassword.error"));
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <Logo />

          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </IconBadge>

          <h1 className="auth-heading">
            {t("forgotPassword.success")}
          </h1>
          <p className="mb-8 text-slate-500">{t("forgotPassword.successSub")}</p>

          <Link
            href={localePath("/auth/login")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:underline"
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard>
        {/* Back to login */}
        <div className="mb-6">
          <Link
            href={localePath("/auth/login")}
            className="back-link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {t("forgotPassword.backToLogin")}
          </Link>
        </div>

        <BrandMark />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">
          {t("forgotPassword.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          {t("forgotPassword.subtitle")}
        </p>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">
              {t("forgotPassword.email")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="text-input"
            />
          </div>

          <TurnstileWidget onToken={setCaptchaToken} locale={locale} resetKey={captchaReset} />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("forgotPassword.submit")}
              </span>
            ) : (
              t("forgotPassword.submit")
            )}
          </button>
        </form>
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
