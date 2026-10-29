"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BandTag } from "../../../settings/patient-channel/BandTag";
import type { RecordTab } from "@/lib/patientChannel/recordTab";

// The patient record's "Canal do Paciente" tab (specs/pc-patient-record-tab.md): what this
// patient sent through the channel, newest first, each row opening the inbox's detail.
// The reason only, never the message text (the detail has it, access-logged; 241).
export function PatientChannelTab({ tab, locale, isSecretary }: { tab: RecordTab; locale: string; isSecretary: boolean }) {
  const t = useTranslations("patientChannel");
  const tp = useTranslations("patientDetail");
  const ts = useTranslations("settings");
  const prefix = locale === "en" ? "" : `/${locale}`;
  // Who it went to, from the viewer's side (the inbox's wording).
  const destination = (d: "doctor" | "secretary") =>
    d === "secretary" ? t("inbox.toSecretary") : isSecretary ? t("inbox.toDoctor", { doctor: tab.doctorName || "—" }) : t("reasons.to.doctor");

  if (tab.failed) return <div className="error-banner" data-testid="pc-record-error">{ts("loadError")}</div>;
  if (tab.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center" data-testid="pc-record-empty">
        <p className="text-sm text-slate-400">{tp("pcEmpty")}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="pc-record-list">
      {tab.rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`${prefix}/dashboard/patient-channel/${r.id}`}
            data-testid="pc-record-row"
            className={`flex flex-col gap-1 rounded-2xl border bg-white p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 ${r.status === "open" ? "border-slate-200" : "border-slate-100 opacity-80"}`}
          >
            <div className="flex shrink-0 items-center sm:w-32">
              {r.band ? (
                <BandTag band={r.band} />
              ) : (
                <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{tp("pcAdmin")}</span>
              )}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{r.reasonTitle}</p>
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 sm:flex-col sm:items-end">
              <span>{r.when}</span>
              <span>{destination(r.destination)} · {t(`inbox.status.${r.status}`)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
