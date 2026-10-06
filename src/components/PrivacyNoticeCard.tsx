"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DISMISS_KEY } from "@/lib/privacyNotice";
import { acknowledgePrivacyNotice } from "@/lib/privacyNoticeActions";

// "We've updated our Privacy Policy" (cf, 6 Oct): shown by the page only when
// the caller's accepted version is older (lib/privacyNotice). "OK" records
// it; the X hides it for this browser session only. Never blocks anything.
export function PrivacyNoticeCard({ date, locale }: { date: string; locale: string }) {
  const t = useTranslations("privacyNotice");
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setHidden(true);
    } catch { /* no storage: show it */ }
  }, []);
  if (hidden) return null;

  function close() {
    setHidden(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* none */ }
  }

  function ok() {
    setFailed(false);
    start(async () => {
      const r = await acknowledgePrivacyNotice(locale);
      if (r.ok) setHidden(true);
      else setFailed(true);
    });
  }

  return (
    <section data-testid="privacy-notice" data-tour-block role="status" className="mb-6 rounded-2xl border border-teal-100 bg-teal-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-teal-900">{t("title")}</p>
          <p className="mt-1 text-sm text-teal-900">{t("body", { date })}</p>
        </div>
        <button type="button" onClick={close} aria-label={t("close")} className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-teal-800 hover:bg-teal-100">×</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href="/privacy" className="rounded-xl px-3 py-2 text-sm font-semibold text-teal-800 underline-offset-2 hover:bg-teal-100 hover:underline">{t("read")}</Link>
        <button type="button" disabled={pending} onClick={ok} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-60">{t("ok")}</button>
        {failed && <span className="text-xs text-red-700">{t("failed")}</span>}
      </div>
    </section>
  );
}
