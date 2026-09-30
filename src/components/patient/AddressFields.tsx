"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ADDRESS_FIELDS, ADDRESS_MARKER, NOTES_ADMIN_MAX, isValidCns, type AddressColumns } from "@/lib/patientAddress";
import type { PatientIdKind } from "@/lib/patientIds";
import { profileOfKind } from "@/lib/country";

// Migration 138 in the patient forms (create and edit): the Endereço section
// (collapsed while empty; labels by the practice's country), the CNS for a
// Brazilian practice and Observações with its "no clinical details" hint.
// The hidden marker tells the action these fields were shown, so a save
// writes them (and a form without them never clears stored values).

const SHORT = new Set(["address_postal_code", "address_number", "address_state"]);
const LABEL_KEY: Record<(typeof ADDRESS_FIELDS)[number]["name"], string> = {
  address_postal_code: "postal", address_street: "street", address_number: "number", address_complement: "complement",
  address_neighborhood: "neighborhood", address_city: "city", address_state: "state",
};
const inputClass = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

export function AddressFields({ kind, values = {} }: { kind: PatientIdKind; values?: AddressColumns }) {
  const t = useTranslations("patientAddress");
  const hasAddress = ADDRESS_FIELDS.some((f) => !!values[f.name]);
  const [notes, setNotes] = useState(values.notes_admin ?? "");
  const [cnsBad, setCnsBad] = useState(false);

  return (
    <div className="space-y-4">
      <input type="hidden" name={ADDRESS_MARKER} value="1" />
      <details open={hasAddress} className="rounded-xl border border-slate-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t("section")}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {ADDRESS_FIELDS.map((f) => (
            <div key={f.name} className={SHORT.has(f.name) ? "" : "col-span-2"}>
              <label htmlFor={`pa-${f.name}`} className={labelClass}>{t(`${kind}_${LABEL_KEY[f.name]}`)}</label>
              <input id={`pa-${f.name}`} name={f.name} defaultValue={values[f.name] ?? ""} maxLength={f.max} className={inputClass}
                autoComplete={f.name === "address_postal_code" ? "postal-code" : "off"} />
            </div>
          ))}
        </div>
      </details>
      {profileOfKind(kind).healthCard === "cns" && (
        <div>
          <label htmlFor="pa-cns" className={labelClass}>{t("cns")}</label>
          <input id="pa-cns" name="cns" defaultValue={values.cns ?? ""} inputMode="numeric" maxLength={20} className={inputClass}
            aria-invalid={cnsBad} aria-describedby="pa-cns-hint"
            onBlur={(e) => setCnsBad(!!e.target.value.trim() && !isValidCns(e.target.value))} onChange={() => setCnsBad(false)} />
          <p id="pa-cns-hint" className={`mt-1 text-xs ${cnsBad ? "text-red-600" : "text-slate-500"}`}>{cnsBad ? t("invalidCns") : t("cnsHint")}</p>
        </div>
      )}
      <div>
        <label htmlFor="pa-notes" className={labelClass}>{t("notes")}</label>
        <textarea id="pa-notes" name="notes_admin" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTES_ADMIN_MAX} rows={3}
          aria-describedby="pa-notes-hint" className={inputClass} />
        <div className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
          <p id="pa-notes-hint">{t("notesHint")}</p>
          <span className="shrink-0 tabular-nums">{t("notesCount", { n: notes.length, max: NOTES_ADMIN_MAX })}</span>
        </div>
      </div>
    </div>
  );
}
