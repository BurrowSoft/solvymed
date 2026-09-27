"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { otpTypeFor } from "@/lib/otpType";
import { useAuthErrorText } from "@/lib/useAuthErrorText";
import ConfirmClient from "../confirm/ConfirmClient";


type State = "ready" | "working" | "expired" | "resetDone";

// appHandoff (used by /auth/confirm): an account created in the mobile app
// goes back to the app after the click, with its session in the deep link,
// as the PKCE flow on that page does. Web accounts follow the web routing.
export function VerifyClient({ locale, tokenHash, type, appHandoff = false }: {
  locale: string;
  tokenHash: string | null;
  type: string;
  appHandoff?: boolean;
}) {
  const t = useTranslations("auth");
  const localePath = (path: string) => (locale === "en" ? path : `/${locale}${path}`);
  const otpType = otpTypeFor(type);
  const [state, setState] = useState<State>(tokenHash && otpType ? "ready" : "expired");
  const [appDeepLink, setAppDeepLink] = useState<string | null>(null);

  // The token now lives only in this component: take it out of the address
  // bar before anything else (history, analytics, error reports) can read it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token_hash")) return;
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  if (appDeepLink) return <ConfirmClient state="signup" deepLink={appDeepLink} autoRedirect />;

  if (state === "expired") {
    return (
      <AuthPageShell languageSwitcher={false}>
        <AuthCard centered>
          <BrandMark />
          <h1 className="auth-heading">{t("verify.expiredTitle")}</h1>
          <p className="mb-8 text-slate-500">{t("verify.expiredBody")}</p>
          <Link
            href={localePath("/auth/login")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"
          >
            {t("verify.goToSignIn")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  if (otpType === "recovery") {
    return (
      <RecoveryForm
        tokenHash={tokenHash!}
        state={state}
        setState={setState}
        loginHref={localePath("/auth/login")}
      />
    );
  }

  const isSignup = otpType === "signup" || otpType === "email";

  async function handleContinue() {
    setState("working");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! });
    if (error) {
      setState("expired");
      return;
    }
    if (appHandoff) {
      const { data: { session } } = await supabase.auth.getSession();
      const platform = session?.user.user_metadata?.platform as string | undefined;
      if (session && platform && platform !== "web") {
        setAppDeepLink(`solvymed://?access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&type=${otpType}`);
        return;
      }
    }
    // The session is set; the server decides where this user goes (role
    // linking, first-confirmation welcome, and so on).
    const res = await fetch("/api/auth/after-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, type: otpType }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { redirect?: string } | null;
    window.location.assign(json?.redirect ?? localePath("/dashboard"));
  }

  return (
    <AuthPageShell languageSwitcher={false}>
      <AuthCard centered>
        <BrandMark />
        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </IconBadge>
        <h1 className="auth-heading">{isSignup ? t("verify.confirmTitle") : t("verify.otherTitle")}</h1>
        <p className="mb-8 text-slate-500">{isSignup ? t("verify.confirmBody") : t("verify.otherBody")}</p>
        <button
          type="button"
          onClick={handleContinue}
          disabled={state === "working"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "working" && <span className="spinner-white" />}
          {t("verify.continue")}
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}

// A password-reset link: the token is used only when the new password is
// submitted (verify, then set it). If the password itself is refused, the
// already-verified session lets the person try again without the token.
function RecoveryForm({ tokenHash, state, setState, loginHref }: {
  tokenHash: string;
  state: State;
  setState: (s: State) => void;
  loginHref: string;
}) {
  const t = useTranslations("auth");
  const authErrorText = useAuthErrorText();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  // An account created in the app: after the reset, send the person back to
  // the app to sign in (no session in the link; they use the new password).
  const [appAccount, setAppAccount] = useState(false);
  const tConfirm = useTranslations("confirm");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.passwordMismatch"));
      return;
    }
    setState("working");
    const supabase = createClient();
    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verifyError) {
        setState("expired");
        return;
      }
      setVerified(true);
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setState("ready");
      setError(authErrorText(updateError) ?? t("errors.generic"));
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const platform = user?.user_metadata?.platform as string | undefined;
    const isApp = !!platform && platform !== "web";
    // An app account signs in in the app: don't leave a browser session behind.
    if (isApp) await supabase.auth.signOut().catch(() => {});
    setAppAccount(isApp);
    setState("resetDone");
  }

  if (state === "resetDone") {
    return (
      <AuthPageShell languageSwitcher={false}>
        <AuthCard centered>
          <BrandMark />
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">{appAccount ? tConfirm("updatedTitle") : t("resetPassword.success")}</h1>
          <p className="mb-8 text-slate-500">{appAccount ? tConfirm("updatedMessage") : t("resetPassword.successSub")}</p>
          {appAccount && (
            <a
              href="solvymed://"
              className="mb-3 inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"
            >
              {tConfirm("openApp")}
            </a>
          )}
          <Link
            href={loginHref}
            className={appAccount
              ? "inline-block text-sm font-semibold text-slate-500 transition hover:text-teal-700"
              : "inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"}
          >
            {t("resetPassword.goToLogin")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell languageSwitcher={false}>
      <AuthCard>
        <BrandMark />
        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{t("resetPassword.title")}</h1>
        <p className="mb-8 text-center text-sm text-slate-500">{t("resetPassword.subtitle")}</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="verify-new-password" className="field-label">{t("resetPassword.newPassword")}</label>
            <input
              id="verify-new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>
          <div>
            <label htmlFor="verify-confirm-password" className="field-label">{t("resetPassword.confirmPassword")}</label>
            <input
              id="verify-confirm-password"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>
          <button
            type="submit"
            disabled={state === "working"}
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "working" ? (
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
    </AuthPageShell>
  );
}
