"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface Props {
  state: "signup" | "recovery" | "unknown";
  deepLink: string;
  autoRedirect?: boolean;
}

export default function ConfirmClient({ state: initialState, deepLink, autoRedirect }: Props) {
  const t = useTranslations("confirm");
  const [redirecting, setRedirecting] = useState(false);
  const [state, setState] = useState(initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hashDeepLink, setHashDeepLink] = useState(deepLink);

  // Handle implicit-flow hash tokens (access_token in URL fragment).
  // The server component only sees ?code= query params; hash fragments are
  // browser-only, so we recover them here.
  useEffect(() => {
    if (initialState !== "unknown") return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (!accessToken || !refreshToken) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) return;
      if (type === "recovery") {
        setState("recovery");
      } else {
        // Signup confirmation via implicit flow — build deep link and redirect
        const link = `solvymed://?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=signup`;
        setHashDeepLink(link);
        setState("signup");
      }
    });
  }, [initialState]);

  // Auto-redirect for signup state
  useEffect(() => {
    if (!autoRedirect && state !== "signup") return;
    if (state !== "signup") return;
    setRedirecting(true);
    const timer = setTimeout(() => {
      window.location.href = hashDeepLink;
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoRedirect, state, hashDeepLink]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setSaveError("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess(true);
    }
  }

  if (state === "unknown") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
          <Logo />
          <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">{t("error")}</h1>
          <p className="mb-8 text-center text-slate-500">{t("errorSub")}</p>
          <a href="/" className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-base font-semibold text-slate-700 transition hover:bg-slate-100">
            {t("backToHome")}
          </a>
        </div>
        <Footer />
      </div>
    );
  }

  if (state === "recovery") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
          <Logo />
          {saveSuccess ? (
            <>
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">Password updated</h1>
              <p className="mb-8 text-center text-slate-500">Your password has been changed. You can now sign in with your new password.</p>
              <a href="/" className="flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700">
                {t("backToHome")}
              </a>
            </>
          ) : (
            <>
              <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">Set new password</h1>
              <p className="mb-6 text-center text-slate-500">Choose a new password for your account.</p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    placeholder="Min. 6 characters"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    placeholder="Repeat password"
                  />
                </div>
                {saveError && <p className="text-sm text-red-500">{saveError}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Set password"}
                </button>
              </form>
            </>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <Logo />

        {state === "signup" && (
          <>
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">{t("emailConfirmed")}</h1>
            <p className="mb-6 text-center text-slate-500">{t("emailConfirmedSub")}</p>
          </>
        )}

        {redirecting && (
          <div className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            {t("opening")}
          </div>
        )}

        <button
          onClick={() => { window.location.href = hashDeepLink; }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
            <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
          </svg>
          {t("openApp")}
        </button>
        <p className="text-center text-xs text-slate-400">{t("openAppHint")}</p>
      </div>
      <Footer />
    </div>
  );
}

function Logo() {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="mt-8 text-sm text-slate-400">
      SolvyMed by{" "}
      <a href="/" className="text-teal-600 hover:underline">BurrowSoft</a>
    </p>
  );
}
