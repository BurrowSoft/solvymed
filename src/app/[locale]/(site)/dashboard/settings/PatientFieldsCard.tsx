"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePatientFieldLabels } from "@/components/patient/usePatientFieldLabels";
import { fieldsFor, ruleOf, type FieldKey, type FieldRule, type PatientFieldRules } from "@/lib/patientFields";
import { savePatientFields } from "./patient-fields-actions";

// 1.8.0 C1: Settings → "Cadastro do paciente" (doctors). A choice per detail:
// Required / Optional / Hidden; name and phone are always required.
export function PatientFieldsCard({ rules, country }: { rules: PatientFieldRules; country: string }) {
  const tf = useTranslations("patientFields");
  const ts = useTranslations("settings");
  const labels = usePatientFieldLabels(country);
  const keys = fieldsFor(country);
  const [values, setValues] = useState<Record<FieldKey, FieldRule>>(
    () => Object.fromEntries(keys.map((k) => [k, ruleOf(rules, k, country)])) as Record<FieldKey, FieldRule>,
  );
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"" | "saved" | "failed">("");

  function save(next: Record<FieldKey, FieldRule>) {
    setStatus("");
    start(async () => {
      const r = await savePatientFields(next);
      setStatus(r.ok ? "saved" : "failed");
    });
  }

  return (
    <section id="patient-fields" data-testid="patient-fields-card" className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900">{tf("title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{tf("hint")}</p>
      <div className="mt-4 divide-y divide-slate-100">
        {keys.map((k) => (
          <label key={k} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="text-sm font-semibold text-slate-800">{labels.label(k)}</span>
            <select
              aria-label={labels.label(k)}
              value={values[k]}
              disabled={pending}
              onChange={(e) => {
                const next = { ...values, [k]: e.target.value as FieldRule };
                setValues(next);
                save(next);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
            >
              <option value="required">{tf("required")}</option>
              <option value="optional">{tf("optional")}</option>
              <option value="hidden">{tf("hidden")}</option>
            </select>
          </label>
        ))}
      </div>
      {status === "saved" && <p role="status" className="mt-3 text-sm font-semibold text-teal-700">{tf("saved")}</p>}
      {status === "failed" && <p role="alert" className="mt-3 text-sm text-red-600">{ts("saveFailed")}</p>}
    </section>
  );
}
