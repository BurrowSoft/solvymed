"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatShortDate } from "@/lib/dateLabels";
import { toLocalDateString } from "@/lib/slots";
import { getImportExtra, type ImportExtra } from "./import-extra-action";

// The source system as people know it; our own template reads "uma planilha"
// (the app's importSourceName).
function sourceName(source: string | null, generic: string): string {
  if (source === "iclinic") return "iClinic";
  if (source === "prontuario_verde") return "Prontuário Verde";
  return generic;
}

// "Dados importados" (the app's ImportedData, 1:1): doctor only, for a
// patient brought by an import; closed until opened, then loaded (and
// logged) on every opening. The import date is a system date: the
// reader's calendar and the browser's day.
export function ImportedData({ patientId }: { patientId: string }) {
  const t = useTranslations("patientDetail");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [extra, setExtra] = useState<ImportExtra | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setState("loading");
      setExtra(null);
      getImportExtra(patientId)
        .then((r) => { if (r) { setExtra(r); setState("ready"); } else setState("error"); })
        .catch(() => setState("error"));
    }
  }

  return (
    <section data-testid="patient-imported-data" className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("importedData")}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && state === "loading" && <p className="mt-3 text-sm text-slate-400">…</p>}
      {open && state === "error" && <p className="mt-3 text-sm text-slate-500">{t("genericError")}</p>}
      {open && state === "ready" && extra && (
        <div className="mt-3 space-y-2">
          {extra.importedAt && (
            <p data-testid="patient-imported-from" className="text-sm text-slate-500">
              {t("importedFrom", { source: sourceName(extra.source, t("importSourceGeneric")), date: formatShortDate(locale, toLocalDateString(new Date(extra.importedAt))) })}
            </p>
          )}
          {extra.data ? (
            <dl className="space-y-2">
              {Object.entries(extra.data).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">{t("importedDataNone")}</p>
          )}
        </div>
      )}
    </section>
  );
}
