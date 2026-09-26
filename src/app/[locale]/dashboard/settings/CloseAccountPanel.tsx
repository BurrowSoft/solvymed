"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// get_account_closure_preview() (migration 100).
export type ClosurePreview = {
  role: "professional" | "secretary" | "patient";
  has_clinical_history: boolean;
  subscription_active: boolean;
  patients: number;
  upcoming_appointments: number;
  secretaries: number;
};

type CloseCode = "unauthorized" | "check_failed" | "stripe_cancel_failed" | "subscription_active" | "generic";

// Closing (a professional with clinical history) or deleting (everyone
// else) the signed-in account, through /api/account/close.
export function CloseAccountPanel({ preview, locale }: { preview: ClosurePreview; locale: string }) {
  const t = useTranslations("accountClose");
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CloseCode | null>(null);

  const closes = preview.role === "professional" && preview.has_clinical_history;
  const isProfessional = preview.role === "professional";

  async function handleClose() {
    setPending(true);
    setError(null);
    let code: CloseCode | null = null;
    try {
      const res = await fetch("/api/account/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) code = ((await res.json().catch(() => null))?.code as CloseCode | undefined) ?? "generic";
    } catch {
      code = "generic";
    }
    if (code) {
      setError(code);
      setPending(false);
      return;
    }
    // The account is gone; drop the local session and leave the dashboard.
    await createClient().auth.signOut().catch(() => {});
    window.location.href = locale === "en" ? "/" : `/${locale}`;
  }

  const errorText =
    error === "stripe_cancel_failed" ? t("errorStripe")
    : error === "subscription_active" ? t("errorSubscription")
    : error ? t("errorGeneric")
    : null;

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6">
      <h2 className="text-base font-bold text-red-700">{closes ? t("titleClose") : t("titleDelete")}</h2>

      {closes ? (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>{t("closeIntro")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("closeLogin")}</li>
            <li>{t("closeRecords")}</li>
            <li>{t("closePatients", { patients: preview.patients, appointments: preview.upcoming_appointments })}</li>
            {preview.secretaries > 0 && <li>{t("closeTeam", { secretaries: preview.secretaries })}</li>}
            <li>{t("closeEmail")}</li>
          </ul>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>{isProfessional ? t("deleteIntroProfessional") : t("deleteIntroSecretary")}</p>
          {isProfessional && preview.upcoming_appointments > 0 && (
            <p>{t("deleteAppointments", { appointments: preview.upcoming_appointments })}</p>
          )}
          {isProfessional && preview.secretaries > 0 && <p>{t("closeTeam", { secretaries: preview.secretaries })}</p>}
        </div>
      )}

      {isProfessional && preview.subscription_active && (
        <p className="mt-3 text-sm font-semibold text-slate-900">{t("noRefund")}</p>
      )}

      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        {t("confirmCheckbox")}
      </label>

      {errorText && <div role="alert" className="error-banner mt-4">{errorText}</div>}

      <button
        type="button"
        onClick={handleClose}
        disabled={!understood || pending}
        className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("working") : closes ? t("closeButton") : t("deleteButton")}
      </button>
    </section>
  );
}
