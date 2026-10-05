"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listColleagues } from "../../../colleague-actions";
import { colleagueLink, colleagueName, firstName, type ColleagueRow } from "@/lib/colleagues";
import { whatsappLink } from "@/lib/whatsappLink";

// The patient page's "Indicar colega" (167; doctors only, behind
// liveFeatures.colleagues): pick one of your colleagues, and the message with
// their public link is ready to copy or (where the practice messages on
// WhatsApp and the patient has a phone) to open in your WhatsApp. Nothing is
// stored and no patient data is shared: the colleague only gets a patient if
// the patient chooses to connect.
export function ReferColleague({ patientName, patientPhone, practiceCountry, whatsapp }: {
  patientName: string;
  patientPhone: string | null;
  practiceCountry: string;
  whatsapp: boolean;
}) {
  const t = useTranslations("colleagues");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ColleagueRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<ColleagueRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();

  function openSheet() {
    setOpen(true);
    setChosen(null);
    setCopied(false);
    start(async () => {
      const r = await listColleagues();
      setFailed(!r.ok);
      setRows(r.ok ? r.rows.filter((c) => c.available) : []);
    });
  }

  const link = chosen ? colleagueLink(chosen) : null;
  const message = chosen && link
    ? chosen.specialty
      ? t("shareMessage", { patient: firstName(patientName), colleague: colleagueName(chosen), specialty: chosen.specialty, link })
      : t("shareMessageNoSpecialty", { patient: firstName(patientName), colleague: colleagueName(chosen), link })
    : "";
  const wa = message && whatsapp && patientPhone ? whatsappLink(patientPhone, practiceCountry, message) : null;

  return (
    <>
      <button type="button" onClick={openSheet} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        {t("refer")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={t("refer")} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t("refer")}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="×" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-500">{t("referHint")}</p>
              {rows === null ? (
                <p className="text-sm text-slate-400">…</p>
              ) : failed ? (
                <p className="text-sm text-red-600">{t("failed")}</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-slate-500">{t("referNone")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {rows.map((c) => (
                    <li key={c.colleague_id}>
                      <button type="button" onClick={() => { setChosen(c); setCopied(false); }} aria-pressed={chosen?.colleague_id === c.colleague_id}
                        className={`w-full px-4 py-3 text-left text-sm ${chosen?.colleague_id === c.colleague_id ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                        <span className="font-semibold text-slate-800">{colleagueName(c)}</span>
                        {c.specialty && <span className="text-slate-500"> · {c.specialty}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {message && (
                <div className="space-y-3">
                  <textarea readOnly value={message} rows={4} data-testid="refer-message" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => {})}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      {copied ? t("copied") : t("copy")}
                    </button>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="refer-whatsapp"
                        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                        {t("whatsapp")}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
