"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const t = useTranslations("auth");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (authError) {
      setError(t("login.error"));
    } else if (signInData.user) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", signInData.user.id)
        .maybeSingle();
      // No persisted role but signed up intending to be a patient (invite
      // code never resolved) — send back to the retry form, not /dashboard.
      const metaRole = signInData.user.user_metadata?.role as string | undefined;
      const dest = roleRow?.role === "patient"
        ? localePath("/my-appointments")
        : !roleRow?.role && metaRole === "patient"
        ? localePath("/auth/invite-required")
        : localePath("/dashboard");
      router.push(dest);
      router.refresh();
    }
  }

  return (
    <AuthPageShell>
      <AuthCard>
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
            <label className="field-label">
              {t("login.email")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              data-testid="login-email"
              className="text-input"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                {t("login.password")}
              </label>
              <Link
                href={localePath("/auth/forgot-password")}
                className="text-xs text-teal-600 hover:underline"
              >
                {t("login.forgotPassword")}
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="login-password"
              className="text-input"
            />
          </div>

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
