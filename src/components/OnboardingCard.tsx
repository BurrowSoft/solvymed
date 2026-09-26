"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { dismissOnboardingCard } from "@/lib/setupActions";

// One-time cards (first-run spec §5). Dismissed on the server, so a card
// never comes back, on any device. The secretary card shows on their first
// dashboard visit after linking; the patient card on My appointments after
// connecting to a clinic (once per clinic).
export function OnboardingCard({ kind, clinicName, bookHref }: {
  kind: "secretary_welcome" | "patient_connected";
  clinicName: string;
  bookHref?: string;
}) {
  const t = useTranslations("onboarding");
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  function dismiss(then?: () => void) {
    setGone(true);
    start(async () => {
      await dismissOnboardingCard(kind);
      then?.();
    });
  }

  const text = kind === "secretary_welcome"
    ? t("secretaryWelcome", { clinic: clinicName })
    : t("patientConnected", { clinic: clinicName });

  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-5" role="status">
      <p className="min-w-0 flex-1 text-sm font-medium text-teal-900">{text}</p>
      <div className="flex shrink-0 items-center gap-2">
        {kind === "patient_connected" && bookHref && (
          <button
            type="button"
            disabled={pending}
            onClick={() => dismiss(() => { window.location.href = bookHref; })}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700"
          >
            {t("bookAppointment")}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => dismiss()}
          className={kind === "secretary_welcome"
            ? "rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700"
            : "rounded-xl px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"}
        >
          {kind === "secretary_welcome" ? t("gotIt") : t("dismiss")}
        </button>
      </div>
    </section>
  );
}
