"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DateInput } from "@/components/DateInput";
import { AddressFields } from "@/components/patient/AddressFields";
import { usePatientFieldLabels } from "@/components/patient/usePatientFieldLabels";
import { selfMissing, selfValues, type SelfPrompt } from "@/lib/selfFields";
import type { FieldKey } from "@/lib/patientFields";
import type { PatientIdKind } from "@/lib/patientIds";
import { dismissSelfFields, saveSelfFields } from "./self-fields-actions";

// 1.8.0 C2 (ad): "{doctor} pediu alguns dados" on My appointments, one card
// per doctor whose required details are still empty in their record. It
// never blocks anything (booking included): "Agora não" puts it off until the
// doctor requires a new field. The form asks only those fields, with nothing
// from the record shown (only the patient's own profile prefills).

const input = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

export function CompleteRegistrationCards({ prompts }: { prompts: SelfPrompt[] }) {
  return <>{prompts.map((p) => <CompleteRegistrationCard key={p.doctorId} prompt={p} />)}</>;
}

function CompleteRegistrationCard({ prompt }: { prompt: SelfPrompt }) {
  const t = useTranslations("selfFields");
  const [state, setState] = useState<"card" | "form" | "done" | "gone">("card");
  const [pending, start] = useTransition();
  if (state === "gone") return null;
  if (state === "done") {
    return <p role="status" data-testid="self-fields-done" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{t("done")}</p>;
  }
  return (
    <div data-testid="self-fields-card" className="mb-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
      <p className="text-sm font-bold text-slate-900">{t("cardTitle", { doctor: prompt.doctorName })}</p>
      <p className="mt-1 text-sm text-slate-600">{t("cardBody")}</p>
      {state === "card" ? (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setState("form")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700">{t("complete")}</button>
          <button type="button" disabled={pending} onClick={() => start(async () => { if (await dismissSelfFields(prompt.doctorId)) setState("gone"); })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">{t("notNow")}</button>
        </div>
      ) : (
        <SelfFieldsForm prompt={prompt} onDone={() => setState("done")} onCancel={() => setState("card")} />
      )}
    </div>
  );
}

function SelfFieldsForm({ prompt, onDone, onCancel }: { prompt: SelfPrompt; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("selfFields");
  const tp = useTranslations("patients");
  const tIds = useTranslations("patientIds");
  const tAddr = useTranslations("patientAddress");
  const tDate = useTranslations("dateInput");
  const { label, missing } = usePatientFieldLabels(prompt.country);
  const formRef = useRef<HTMLFormElement>(null);
  const tf = useTranslations("patientFields");
  const [error, setError] = useState("");
  // A field the server refused: its message goes under that field (ad).
  const [fieldError, setFieldError] = useState<{ key: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const kind: PatientIdKind = prompt.country === "BR" ? "BR" : prompt.country === "TH" ? "TH" : "OTHER";
  const asks = (k: FieldKey) => prompt.keys.includes(k);

  function invalidText(key: FieldKey): string {
    if (key === "national_id" && prompt.country === "TH") return tIds("thaiIdInvalid");
    if (key === "cns") return tAddr("invalidCns");
    if (key === "birth_date") return tDate("invalidBirthDate");
    return t("invalid", { field: label(key) });
  }
  const errFor = (k: FieldKey) => fieldError?.key === k ? <p role="alert" className="mt-1 text-xs text-red-600">{fieldError.text}</p> : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const values = selfValues(prompt.keys, prompt.country, (n) => (fd.get(n) as string | null) ?? "");
    const left = selfMissing(prompt.keys, values);
    setFieldError(null);
    if (left.length) { setError(tf("missing", { fields: left.map(missing).join(", ") })); return; }
    setError("");
    start(async () => {
      const r = await saveSelfFields(prompt.doctorId, values);
      if (r.ok) { onDone(); return; }
      // 212 names the field: a refused value, or the one holding a duplicate ID / e-mail.
      if (r.key && (prompt.keys as string[]).includes(r.key) && (r.error === "invalid" || r.error === "id_in_use")) {
        setFieldError({ key: r.key, text: r.error === "id_in_use" ? (r.key === "email" ? t("emailInUse") : t("idInUse")) : invalidText(r.key as FieldKey) });
        return;
      }
      setError(r.error === "id_in_use" ? t("idInUse") : t("saveFailed"));
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} data-testid="self-fields-form" className="mt-3 space-y-3 rounded-xl bg-white p-4">
      <p className="text-sm font-bold text-slate-900">{t("formTitle")}</p>
      <p className="text-xs text-slate-500">{t("hint", { doctor: prompt.doctorName })}</p>
      {asks("email") && (
        <label className="block"><span className={labelCls}>{label("email")}</span>
          <input name="email" type="email" defaultValue={prompt.prefill.email ?? ""} className={input} /></label>
      )}{errFor("email")}
      {asks("birth_date") && (
        <label className="block"><span className={labelCls}>{label("birth_date")}</span>
          <DateInput birthDate name="birth_date" defaultValue={prompt.prefill.birth_date ?? ""} className={input} /></label>
      )}{errFor("birth_date")}
      {asks("national_id") && kind === "BR" && (
        <label className="block"><span className={labelCls}>{label("national_id")}</span>
          <input name="cpf" inputMode="numeric" maxLength={14} defaultValue={prompt.prefill.cpf ?? ""} className={input} /></label>
      )}
      {asks("national_id") && kind === "TH" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={labelCls}>{tIds("thaiId")}</span>
            <input name="th_national_id" inputMode="numeric" maxLength={17} className={input} /></label>
          <label className="block"><span className={labelCls}>{t("orPassport")}</span>
            <input name="national_passport" maxLength={30} className={input} /></label>
        </div>
      )}
      {asks("national_id") && kind === "OTHER" && (
        <label className="block"><span className={labelCls}>{label("national_id")}</span>
          <input name="national_passport" maxLength={30} className={input} /></label>
      )}
      {errFor("national_id")}
      {asks("rg_passport") && (
        <label className="block"><span className={labelCls}>{label("rg_passport")}</span>
          <input name="rg_passport" maxLength={30} className={input} /></label>
      )}{errFor("rg_passport")}
      {asks("sex") && (
        <label className="block"><span className={labelCls}>{label("sex")}</span>
          <select name="sex" defaultValue="" className={`${input} bg-white`}>
            <option value="">{tp("notSpecified")}</option>
            <option value="male">{tp("male")}</option>
            <option value="female">{tp("female")}</option>
            <option value="other">{tp("other")}</option>
          </select></label>
      )}{errFor("sex")}
      {asks("insurance") && (
        <label className="block"><span className={labelCls}>{label("insurance")}</span>
          <select name="insurance" defaultValue="" className={`${input} bg-white`}>
            <option value="">{tp("notSpecified")}</option>
            <option value="particular">{tp("private")}</option>
            <option value="health_plan">{tp("healthPlan")}</option>
          </select></label>
      )}{errFor("insurance")}
      {asks("profession") && (
        <label className="block"><span className={labelCls}>{label("profession")}</span>
          <input name="profession" maxLength={120} placeholder={tp("professionPlaceholder")} className={input} /></label>
      )}{errFor("profession")}
      {asks("emergency_contact") && (
        <label className="block"><span className={labelCls}>{label("emergency_contact")}</span>
          <input name="emergency_contact" type="tel" maxLength={40} className={input} /></label>
      )}{errFor("emergency_contact")}
      {(asks("address") || asks("cns")) && (
        <AddressFields kind={kind} show={{ address: asks("address"), cns: asks("cns"), notes: false }} required={{ address: true, cns: true, notes: false }} />
      )}{errFor("address")}{errFor("cns")}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600">{tp("cancel")}</button>
        <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? tp("saving") : t("complete")}</button>
      </div>
    </form>
  );
}
