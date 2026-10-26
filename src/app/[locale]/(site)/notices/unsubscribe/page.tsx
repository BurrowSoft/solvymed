"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { isWellFormedToken } from "@/lib/notices/unsubscribe";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";
import { Logo } from "@/components/Logo";

// "Não quero receber estes e-mails" (the footer of the Patient Channel notice
// e-mails, 247). Opening the link only shows the button: a mail scanner that
// prefetches it changes nothing. The click POSTs the token; any well-formed
// token gets the same confirmation (the RPC never says whether it exists).
export default function NoticesUnsubscribePage() {
  const t = useTranslations("noticesUnsubscribe");
  const token = useSearchParams()?.get("t");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  async function stop() {
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/notices/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      if (res.ok) setDone(true);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (!isWellFormedToken(token)) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <Logo />
          <h1 className="auth-heading">{t("title")}</h1>
          <p className="text-slate-500" data-testid="unsubscribe-incomplete">{t("incomplete")}</p>
        </AuthCard>
      </AuthPageShell>
    );
  }

  if (done) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">{t("title")}</h1>
          <p className="text-slate-500" data-testid="unsubscribe-done">{t("done")}</p>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard centered>
        <Logo />
        <h1 className="auth-heading">{t("title")}</h1>
        <p className="mb-6 text-slate-500">{t("lead")}</p>
        <button
          type="button"
          onClick={stop}
          disabled={loading}
          aria-busy={loading}
          className="w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner-white" />
              {t("button")}
            </span>
          ) : (
            t("button")
          )}
        </button>
        {error && <div role="alert" className="error-banner mt-4">{t("error")}</div>}
      </AuthCard>
    </AuthPageShell>
  );
}
