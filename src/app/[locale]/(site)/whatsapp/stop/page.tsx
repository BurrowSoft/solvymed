"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { isWellFormedStopToken } from "@/lib/whatsapp/stop";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";
import { Logo } from "@/components/Logo";

// The stop link of the automatic WhatsApp messages to patients (contract v2,
// PC-W1′). Opening the link only shows the button: a link preview or scanner
// changes nothing. The click POSTs the token; the answer is only { ok }, so the
// page never names the practice ("this practice") and its language is the link's.
export default function WhatsAppStopPage() {
  const t = useTranslations("whatsappStop");
  const token = useSearchParams()?.get("t");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [state, setState] = useState<"ask" | "done" | "invalid">(isWellFormedStopToken(token) ? "ask" : "invalid");

  async function stop() {
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const out = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      if (res.ok && out?.ok === true) setState("done");
      else if (res.ok && out?.ok === false) setState("invalid");
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (state === "invalid") {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <Logo />
          <h1 className="auth-heading">{t("title")}</h1>
          <p className="text-slate-500" data-testid="whatsapp-stop-invalid">{t("invalid")}</p>
        </AuthCard>
      </AuthPageShell>
    );
  }

  if (state === "done") {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">{t("title")}</h1>
          <p className="text-slate-500" data-testid="whatsapp-stop-done">{t("done")}</p>
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
