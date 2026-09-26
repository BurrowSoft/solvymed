"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { useAuthErrorText } from "@/lib/useAuthErrorText";

type PageState = "loading" | "form" | "success" | "error";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const authErrorText = useAuthErrorText();
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token") ?? "";

    // Only a recovery link's own tokens open the form, never an existing
    // session. Older PKCE links (?code=) never worked on this page; they show
    // the error state, which offers to request a new link. The check comes
    // before creating the client, so a stale link doesn't initialize it (and
    // e.g. consume a ?code=) and break a newer link in the same browser.
    if (!accessToken) {
      setPageState("error");
      return;
    }

    const supabase = createClient();

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setPageState("error");
        } else {
          setPageState("form");
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("resetPassword.passwordMismatch"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(authErrorText(updateError) ?? t("errors.generic"));
    } else {
      setPageState("success");
    }
  }

  if (pageState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-sm text-slate-500">{t("resetPassword.loading")}</p>
        </div>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <AuthPageShell languageSwitcher={false}>
        <AuthCard centered>
          <BrandMark />
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">
            {t("resetPassword.success")}
          </h1>
          <p className="mb-8 text-slate-500">{t("resetPassword.successSub")}</p>
          <Link
            href={localePath("/auth/login")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"
          >
            {t("resetPassword.goToLogin")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  if (pageState === "error") {
    return (
      <AuthPageShell languageSwitcher={false}>
        <AuthCard centered>
          <BrandMark />
          <h1 className="auth-heading">
            {t("resetPassword.error")}
          </h1>
          <p className="mb-8 text-slate-500">{t("resetPassword.error")}</p>
          <Link
            href={localePath("/auth/forgot-password")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"
          >
            {t("forgotPassword.title")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell languageSwitcher={false}>
      <AuthCard>
        <BrandMark />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">
          {t("resetPassword.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          {t("resetPassword.subtitle")}
        </p>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">
              {t("resetPassword.newPassword")}
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>
          <div>
            <label className="field-label">
              {t("resetPassword.confirmPassword")}
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("resetPassword.submit")}
              </span>
            ) : (
              t("resetPassword.submit")
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
