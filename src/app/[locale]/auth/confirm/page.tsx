"use client";

import { useEffect, useState } from "react";

type ConfirmState = "loading" | "signup" | "recovery" | "unknown";

export default function AuthConfirmPage() {
  const [state, setState] = useState<ConfirmState>("loading");
  const [deepLink, setDeepLink] = useState("solvymed://");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token") ?? "";

    if (!accessToken) {
      setState("unknown");
      return;
    }

    const link = `solvymed://?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=${type ?? ""}`;
    setDeepLink(link);

    if (type === "signup") {
      setState("signup");
      setRedirecting(true);
      const timer = setTimeout(() => {
        window.location.href = link;
      }, 1500);
      return () => clearTimeout(timer);
    } else if (type === "recovery") {
      setState("recovery");
      setRedirecting(true);
      const timer = setTimeout(() => {
        window.location.href = link;
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setState("unknown");
    }
  }, []);

  const openApp = () => {
    window.location.href = deepLink;
  };

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
        </div>

        {state === "signup" && (
          <>
            {/* Checkmark */}
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">
              Email confirmed!
            </h1>
            <p className="mb-6 text-center text-slate-500">
              Your SolvyMed account is ready.
            </p>

            {redirecting && (
              <div className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                Opening SolvyMed&hellip;
              </div>
            )}

            <button
              onClick={openApp}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
                <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
              </svg>
              Open SolvyMed
            </button>
            <p className="text-center text-xs text-slate-400">
              If the app doesn&apos;t open automatically, tap the button above.
            </p>
          </>
        )}

        {state === "recovery" && (
          <>
            <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">
              Reset your password
            </h1>
            <p className="mb-6 text-center text-slate-500">
              Open the SolvyMed app to set a new password for your account.
            </p>

            {redirecting && (
              <div className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                Opening SolvyMed&hellip;
              </div>
            )}

            <button
              onClick={openApp}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
            >
              Open SolvyMed
            </button>
          </>
        )}

        {state === "unknown" && (
          <>
            <h1 className="mb-2 text-center text-2xl font-extrabold text-slate-900">
              Something went wrong
            </h1>
            <p className="mb-8 text-center text-slate-500">
              This link may have expired or already been used. Please try signing up again in the app.
            </p>
            <a
              href="/"
              className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-base font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Back to Solvymed.com
            </a>
          </>
        )}
      </div>

      <p className="mt-8 text-sm text-slate-400">
        SolvyMed by{" "}
        <a href="/" className="text-teal-600 hover:underline">
          BurrowSoft
        </a>
      </p>
    </div>
  );
}
