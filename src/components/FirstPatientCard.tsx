"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTour } from "@/components/tour/TourProvider";
import { track } from "@/lib/track";

// Activation B1 (specs/activation-and-demo-metrics.md): a new practice with no patient
// yet gets ONE clear next step on the dashboard home, add the first patient (or book the
// first appointment), until the first patient exists. Hidden while the guided tour is
// on screen (it appears when the tour ends or is skipped). Doctors only (the page).
export function FirstPatientCard({ prefix }: { prefix: string }) {
  const t = useTranslations("firstPatient");
  const { running } = useTour();
  if (running) return null;
  return (
    <section data-testid="first-patient-card" aria-labelledby="first-patient-title" className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-6">
      <h2 id="first-patient-title" className="text-lg font-extrabold text-teal-950">{t("title")}</h2>
      <p className="mt-1 max-w-prose text-sm text-teal-900">{t("body")}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href={`${prefix}/dashboard/patients?new=1`}
          onClick={() => track("first_patient_card", { action: "add" })}
          className="rounded-xl bg-teal-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-teal-700"
        >
          {t("add")}
        </Link>
        <Link
          href={`${prefix}/dashboard/schedule`}
          onClick={() => track("first_patient_card", { action: "book" })}
          className="rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-teal-800 underline-offset-2 hover:underline"
        >
          {t("book")}
        </Link>
      </div>
    </section>
  );
}
