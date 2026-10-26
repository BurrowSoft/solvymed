"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { countryProfile } from "@/lib/country";
import { dateLocale, plainSpaces } from "@/lib/dateLabels";
import type { PcMyRequest } from "@/lib/patientChannel/patientPage";

// "Suas mensagens" (P-14; 01, 10-26): the patient's requests with this practice, newest
// first, from 237's pc_my_requests (their own; never a score, a band or a breakdown).
// The latest one as a card (the reason, the date, what they wrote or chose, a status line
// and, once answered, "Resposta do consultório"); the earlier ones behind a toggle, each
// opening to the same card. Dates in the practice's zone and calendar, as the doctor sees
// them. Every status has a line; one the page doesn't know shows "Recebida" (01: never
// drop a request the patient sent).
export function MyRequests({ requests, timeZone, country }: { requests: PcMyRequest[]; timeZone?: string; country?: string | null }) {
  const t = useTranslations("patientChannel.patient");
  const locale = useLocale();
  const [showEarlier, setShowEarlier] = useState(false);
  if (requests.length === 0) return null;
  const fmt = new Intl.DateTimeFormat(dateLocale(locale, country ? countryProfile(country).calendar : undefined), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}),
  });
  const when = (iso: string | null) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? plainSpaces(fmt.format(d)) : "";
  };
  const [latest, ...earlier] = requests;
  return (
    <section data-testid="pc-my-requests" className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("myRequests")}</h2>
      <RequestCard r={latest} when={when} />
      {earlier.length > 0 && (
        <>
          <button type="button" data-testid="pc-my-requests-earlier" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}
            className="w-max text-sm font-semibold text-teal-700 underline">
            {t("earlier", { n: earlier.length })}
          </button>
          {showEarlier && earlier.map((r) => (
            <details key={r.id} data-testid="pc-my-request-earlier" className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-sm">
                <b className="break-words">{r.reasonTitle}</b>
                <span className="block text-xs text-slate-500">{when(r.createdAt)} · {statusLine(r, t, when)}</span>
              </summary>
              <div className="mt-2"><RequestCard r={r} when={when} bare /></div>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

type T = ReturnType<typeof useTranslations<"patientChannel.patient">>;

function statusLine(r: PcMyRequest, t: T, when: (iso: string | null) => string): string {
  switch (r.status) {
    case "open": return t("statusOpen");
    case "answered": return r.replyText ? t("statusAnswered", { when: when(r.repliedAt) }) : t("statusClosed");
    case "call_back": return t("statusCallBack");
    case "substituted": return t("statusSubstituted");
    case "other": return t("statusReceived");
  }
}

function RequestCard({ r, when, bare = false }: { r: PcMyRequest; when: (iso: string | null) => string; bare?: boolean }) {
  const t = useTranslations("patientChannel.patient");
  const tone = r.status === "open" ? "text-amber-800" : r.status === "substituted" || r.status === "other" ? "text-slate-500" : "text-green-800";
  return (
    <div data-testid="pc-my-request" data-status={r.status} className={bare ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3"}>
      {!bare && (
        <div>
          <b className="block break-words text-slate-900">{r.reasonTitle}</b>
          <span className="text-xs text-slate-500">{when(r.createdAt)}</span>
        </div>
      )}
      {r.option ? (
        <p className="text-sm text-slate-700">{t("youChose", { option: r.option })}</p>
      ) : r.text ? (
        <div className="text-sm text-slate-700">
          <span className="block text-xs text-slate-500">{t("youWrote")}</span>
          <p className="whitespace-pre-wrap break-words">{r.text}</p>
        </div>
      ) : null}
      <p data-testid="pc-my-request-status" className={`text-sm font-semibold ${tone}`}>{statusLine(r, t, when)}</p>
      {r.replyText && (
        <div data-testid="pc-my-request-reply" className="rounded-xl border-l-4 border-teal-600 bg-teal-50 p-3 text-sm text-slate-800">
          <span className="block text-xs font-bold text-teal-800">{t("replyTitle")}</span>
          <p className="mt-1 whitespace-pre-wrap break-words">{r.replyText}</p>
        </div>
      )}
    </div>
  );
}
