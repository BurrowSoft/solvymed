"use client";

import { useTranslations } from "next-intl";
import { MyRequests } from "@/components/patientChannel/MyRequests";
import type { PcMyRequest } from "@/lib/patientChannel/patientPage";

// The channel when it isn't taking new messages here (01, 10-26): the doctor turned it
// off, or the patient is no longer connected, but they have requests with this practice.
// Read-only: "Suas mensagens" (their requests and the practice's replies) and the line
// saying new messages aren't taken here; no form, no FAQ, no reasons. The emergency line
// stays.
export function ReadOnlyChannel({ doctorName, practiceLine, emergencyNumber, requests, timeZone, country }: {
  doctorName: string;
  practiceLine: string;
  emergencyNumber: string | null;
  requests: PcMyRequest[];
  timeZone?: string;
  country?: string | null;
}) {
  const t = useTranslations("patientChannel.patient");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6" data-testid="pc-read-only">
      <div className="border-b border-slate-100 pb-3">
        <b className="block break-words text-slate-900">{doctorName}</b>
        {practiceLine && <span className="text-xs text-slate-500">{practiceLine}</span>}
      </div>
      <p data-testid="pc-read-only-note" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{t("notTaking")}</p>
      <p className="rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("urgentCall", { number: emergencyNumber ?? t("localNumber") })}</p>
      <MyRequests requests={requests} timeZone={timeZone} country={country} />
    </div>
  );
}
