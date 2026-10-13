"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  OFFERED_DOC_LANGS, PRINT, docLangsFor, docLangsForType, documentTypesFor, sharesSnapshot, fixedLanguage, formatCpfDigits, idLabel, prefilledBody, registrationLine, validateFields,
  type CertificateFields, type ControlledFields, type DeclarationFields, type DocFields, type DocLang,
  type ExamRequestFields, type MedicalDocType, type ThCertificateFields,
} from "@/lib/medicalDocuments";
import { clinicDate } from "@/lib/clinicTime";
import { correctMedicalDocument, createMedicalDocument, documentPrintData, updateMedicalDocument } from "../medical-documents-actions";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { copySharedNow } from "../documents-actions";
import { renderMedicalDocumentPdf } from "@/lib/pdf/medicalDocument";
import { renderControlledPrescriptionPdf } from "@/lib/pdf/controlledPrescription";
import { DateInput } from "@/components/DateInput";
import { crmIssuer } from "@/lib/registration";
import { safeCall, NETWORK_FAILURE, timeLimit } from "@/lib/netError";
import { SHARE_CHECK_MS } from "@/lib/patientDocuments";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { createClient } from "@/lib/supabase/client";
import { signatureBytes } from "@/lib/studio/signature";
import { medicalDocumentContent } from "@/lib/studio/content";
import { signalShareCheck } from "@/lib/shareSignal";

// 1.8.0 B: the document dialog (flag 'clinical_documents'; cf's placement:
// "+ Documento" in the patient's "Receitas e documentos"). The type first
// (the practice country's list), then the document's language (the
// controlled prescription is Portuguese only), the type's fields and the
// text: the prefilled sentence follows the fields until the doctor edits it.

export type MedDoc = {
  id: string;
  doc_type: MedicalDocType;
  language: DocLang;
  fields: Record<string, unknown>;
  body: string | null;
  created_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  corrects_id?: string | null;
  correction_reason?: string | null;
};

// The languages' own names (the picker shows each in itself).
const LANG_NAMES: Record<DocLang, string> = { "pt-BR": "Português", en: "English", th: "ไทย", es: "Español", de: "Deutsch", fr: "Français", it: "Italiano" };

// Today in the PRACTICE's time zone (1.9.0, as the app's clinicToday): a
// Brazilian practice on a computer set to Bangkok time defaulted its
// documents to tomorrow. Without a zone (never on the patient page), the
// browser's day.
const today = (tz?: string) => {
  if (tz) return clinicDate(new Date(), tz);
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function emptyFields(type: MedicalDocType, tz?: string): DocFields {
  switch (type) {
    case "certificate": return { variant: "absence", date: today(tz), days: 1, start: today(tz), includeCid: false } as CertificateFields;
    case "declaration": return { date: today(tz), from: "", to: "" } as DeclarationFields;
    case "exam_request": return { exams: [], indication: "", cid: "" } as ExamRequestFields;
    case "controlled_prescription": return { items: [{ name: "", dose: "", quantity: "", posology: "" }] } as ControlledFields;
    case "th_certificate": return { examDate: today(tz) } as ThCertificateFields;
  }
}

export type DocDialogState =
  | { mode: "new"; type: MedicalDocType | null }
  | { mode: "edit" | "correct"; doc: MedDoc };

const input = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

// The rest period's last day: start + days − 1 (YYYY-MM-DD, UTC arithmetic).
export function restEnd(start: string, days: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(1, Math.floor(days)) - 1);
  return d.toISOString().slice(0, 10);
}

export function DocumentDialog({ state, patientId, patientName, country, hasPatientId, onClose, onSaved, onAlreadySaved, onDirtyChange, reasonField, canShare = false, timeZone }: {
  state: DocDialogState;
  patientId: string;
  patientName: string;
  country: string;
  // Whether the patient has a CPF / passport (the controlled prescription needs one).
  hasPatientId: boolean;
  // Cancel: the host asks "Descartar alterações?" when something changed.
  onClose: () => void;
  // After a save (nothing to discard).
  // After a save; with the new / corrected document to share (1.8.0 B2).
  onSaved?: (saved?: { doc: MedDoc; correctsId: string | null; share: boolean; issued: boolean }) => void;
  // Saved before the doctor's last changes (216, a retry): the host closes
  // the dialog and shows the stored version with a message.
  onAlreadySaved?: () => void;
  // The practice's time zone: the default dates are its today.
  timeZone?: string;
  // Whether anything changed since the dialog opened (12's #413 row, ad).
  onDirtyChange?: (dirty: boolean) => void;
  reasonField: React.ReactNode;
  // 1.8.0 B2: "Compartilhar com o paciente" (flag patient_documents).
  canShare?: boolean;
}) {
  const t = useTranslations("documents");
  const tp = useTranslations("patientDetail");
  const tdate = useTranslations("dateInput");
  const tdocs = useTranslations("docs");
  const uiLocale = useLocale();
  const existing = state.mode !== "new" ? state.doc : null;
  const [type, setType] = useState<MedicalDocType | null>(existing?.doc_type ?? (state.mode === "new" ? state.type : null));
  const defaultLang: DocLang = (OFFERED_DOC_LANGS as readonly string[]).includes(uiLocale) ? (uiLocale as DocLang) : "en";
  const [lang, setLang] = useState<DocLang>(existing?.language ?? defaultLang);
  const [fields, setFields] = useState<DocFields | null>(existing ? (existing.fields as DocFields) : type ? emptyFields(type, timeZone) : null);
  const [body, setBody] = useState(existing?.body ?? "");
  // The prefilled text follows the fields until the doctor edits it (1.9.0,
  // c5's rule, the same in the app): no stored flag; the text counts as
  // untouched while it equals (trimmed) what the fields generate. A field
  // change refills untouched text; edited text is kept, with a note that it
  // may no longer match (a certificate saying 3 days in its field and 2 in
  // its text was found while filming).
  const [fieldsChanged, setFieldsChanged] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // ON by default for a new one (the A spec); never for the controlled
  // prescription. Editing / correcting: as its patient copy is now (1.9.0,
  // 02). Until that's known the box and Save wait; when it can't be read
  // the doctor chooses (ec: unknown is not hidden). The doctor's own click
  // always wins.
  const [share, setShareOn] = useState(state.mode === "new");
  // The choice as of the last change, read by Save itself (F1, fa: a new
  // certificate saved with the box ticked sometimes didn't share): one source
  // of truth that every change writes, never a value from an older render.
  const shareChoice = useRef(state.mode === "new");
  const setShare = (on: boolean) => { shareChoice.current = on; setShareOn(on); };
  const sourceId = existing?.id ?? null;
  const [shareState, setShareState] = useState<"known" | "checking" | "unknown">(canShare && sourceId ? "checking" : "known");
  const shareTouched = useRef(false);
  useEffect(() => {
    if (!canShare || !sourceId) return;
    let live = true;
    const done = (s: "on" | "off" | "unknown") => {
      if (!live || shareTouched.current) return;
      if (s === "unknown") { setShareState("unknown"); return; }
      setShare(s === "on");
      setShareState("known");
    };
    timeLimit(copySharedNow(patientId, "medical_document", sourceId), SHARE_CHECK_MS, "unknown" as const).then(done, () => done("unknown"));
    return () => { live = false; };
  }, [canShare, patientId, sourceId]);
  const types = documentTypesFor(country);
  const shareShown = canShare && !!type && sharesSnapshot(type);
  // Save waits for the copy's state (or the doctor's choice) only when the
  // box is shown (never for the controlled prescription).
  const shareWaits = shareShown && shareState !== "known";
  const effLang = (type && fixedLanguage(type)) ?? lang;

  // Changed since it opened: the host confirms before closing, and leaving
  // the page asks too (the browser's own prompt).
  const snapshot = JSON.stringify({ type, lang, fields, body });
  const opened = useRef(snapshot);
  // Saved once (216): one id for this dialog, sent with every try (a retry
  // after a lost answer finds the first save); a new one only on id_conflict.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const tries = useRef(0);
  const dirty = snapshot !== opened.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const generated = type && fields ? prefilledBody(type, fields, effLang, patientName) : "";
  const edited = body.trim() !== generated.trim();
  // Refill only text that was the previous generated text.
  const follow = (oldGen: string, newGen: string) => setBody((b) => (b.trim() === oldGen.trim() ? newGen : b));
  const setF = (patch: Partial<DocFields>) => {
    if (!fields) return;
    const next = { ...(fields as object), ...patch } as DocFields;
    setFields(next);
    setFieldsChanged(true);
    if (type) follow(prefilledBody(type, fields, effLang, patientName), prefilledBody(type, next, effLang, patientName));
  };
  // The rest period (Thai certificate): changing the days or the start sets
  // the end to start + days − 1, as the app (12's #413 row); the end stays
  // editable.
  const setRest = (patch: Partial<NonNullable<ThCertificateFields["rest"]>>) => {
    const r = { ...((fields as ThCertificateFields).rest ?? { days: 1, start: today(timeZone), end: today(timeZone) }), ...patch };
    if (("days" in patch || "start" in patch) && r.days >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(r.start)) r.end = restEnd(r.start, r.days);
    setF({ rest: r } as Partial<ThCertificateFields>);
  };
  const pick = (ty: MedicalDocType) => {
    setType(ty);
    const f = emptyFields(ty, timeZone);
    setFields(f);
    setFieldsChanged(false);
    // A type that doesn't offer the chosen language (the Thai certificate:
    // th / en only) starts in its first one.
    const offered = docLangsForType(ty, docLangsFor(country));
    const l = offered.includes(lang) ? lang : offered[0];
    if (l !== lang) setLang(l);
    setBody(prefilledBody(ty, f, fixedLanguage(ty) ?? l, patientName));
  };
  const changeLang = (l: DocLang) => {
    setLang(l);
    if (type && fields) follow(prefilledBody(type, fields, effLang, patientName), prefilledBody(type, fields, fixedLanguage(type) ?? l, patientName));
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !fields) return;
    if (shareWaits) return;
    const bad = validateFields(type, fields, body);
    if (bad) { setError(t(`err.${bad}`)); return; }
    const reason = (new FormData(e.currentTarget as HTMLFormElement).get("reason") as string | null) ?? "";
    // The share decision is taken here, at the click, from the box as it is.
    const wantShare = canShare && shareChoice.current && sharesSnapshot(type);
    // The box shown ticked but the choice read as off: the F1 shape (ec).
    if (canShare && share && sharesSnapshot(type) && !wantShare) signalShareCheck("choice_mismatch", state.mode, { wantShare, hasId: null }, clientId);
    setError("");
    start(async () => {
      const payload = { type, lang: effLang, fields, body, clientId, clientTry: ++tries.current };
      const r = state.mode === "new" ? await safeCall(() => createMedicalDocument(patientId, payload), NETWORK_FAILURE)
        : state.mode === "edit" ? await safeCall(() => updateMedicalDocument(state.doc.id, patientId, payload), NETWORK_FAILURE)
        : await safeCall(() => correctMedicalDocument(state.doc.id, patientId, { ...payload, reason }), NETWORK_FAILURE);
      if (!r.ok) {
        if (r.code === "already_saved_changed") { onAlreadySaved?.(); return; }
        if (r.code === "id_conflict") { setClientId(crypto.randomUUID()); tries.current = 0; }
        const k = r.code.startsWith("field_") ? r.code.slice(6) : null;
        setError(k ? t(`err.${k}` as "err.date") : r.code === "buddhist_year" ? tdate("buddhistYear") : r.code === "reason_required" ? tp("reasonRequired") : r.code === "clinical_record_locked" ? tp("lockedError") : tp("genericError"));
        return;
      }
      // The saved document, as the PDF needs it (the server's copy is the same).
      // An edit (within 24 h) keeps its id: its new copy replaces the old one (86).
      // A new one is saved under the form's id (216): that id even if the
      // answer didn't carry it.
      const id = state.mode === "edit" ? state.doc.id : ((r.data as string | null) ?? (state.mode === "new" ? clientId : null));
      // A share that only the form-id fallback saved (#536): the evidence F1 lacked.
      if (wantShare && state.mode !== "edit" && !r.data) signalShareCheck("id_fallback", state.mode, { wantShare, hasId: !!r.data }, clientId);
      if (onSaved) {
        onSaved(id && type ? {
          doc: { id, doc_type: type, language: effLang, fields: fields as Record<string, unknown>, body: body.trim() || null, created_at: new Date().toISOString() } as MedDoc,
          correctsId: state.mode === "new" ? null : state.doc.id,
          share: wantShare,
          // A new document or a correction is issued now; an edit isn't.
          issued: state.mode !== "edit",
        } : undefined);
      } else onClose();
    });
  }

  const f = fields as Record<string, unknown> | null;
  return (
    <form onSubmit={save} className="space-y-4" data-testid="document-dialog">
      {state.mode === "new" && (
        <div>
          <span className={label}>{t("typeLabel")}</span>
          <div className="flex flex-wrap gap-2">
            {types.map((ty) => (
              <button key={ty} type="button" onClick={() => pick(ty)} aria-pressed={type === ty}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${type === ty ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {t(`type.${ty}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {type && fields && (
        <>
          {fixedLanguage(type) ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("controlledPrintOnly")}</p>
          ) : (
            <label className="block">
              <span className={label}>{t("language")}</span>
              <select value={lang} onChange={(e) => changeLang(e.target.value as DocLang)} className={`${input} bg-white`}>
                {docLangsForType(type, docLangsFor(country), existing?.language).map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">{t("languageHint")}</span>
            </label>
          )}

          {type === "certificate" && (
            <>
              <div className="flex gap-2" role="radiogroup" aria-label={t("type.certificate")}>
                {(["absence", "attendance"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={f!.variant === v} onClick={() => setF({ variant: v } as Partial<CertificateFields>)}
                    className={`rounded-full border px-3 py-1 text-sm ${f!.variant === v ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-600"}`}>
                    {t(`certVariant.${v}`)}
                  </button>
                ))}
              </div>
              <label className="block"><span className={label}>{t("visitDate")}</span>
                <DateInput value={(f!.date as string) ?? ""} onChange={(v) => setF({ date: v } as Partial<CertificateFields>)} className={input} />
              </label>
              {f!.variant === "absence" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className={label}>{t("days")}</span>
                    <input type="number" min={1} max={365} value={(f!.days as number) ?? 1} onChange={(e) => setF({ days: Number(e.target.value) } as Partial<CertificateFields>)} className={input} />
                  </label>
                  <label className="block"><span className={label}>{t("startDate")}</span>
                    <DateInput value={(f!.start as string) ?? ""} onChange={(v) => setF({ start: v } as Partial<CertificateFields>)} className={input} />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className={label}>{t("timeFrom")}</span>
                    <input type="time" value={(f!.from as string) ?? ""} onChange={(e) => setF({ from: e.target.value } as Partial<CertificateFields>)} className={input} />
                  </label>
                  <label className="block"><span className={label}>{t("timeTo")}</span>
                    <input type="time" value={(f!.to as string) ?? ""} onChange={(e) => setF({ to: e.target.value } as Partial<CertificateFields>)} className={input} />
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!f!.includeCid} onChange={(e) => setF({ includeCid: e.target.checked } as Partial<CertificateFields>)} className="h-4 w-4 accent-teal-600" />
                {t("includeCid")}
              </label>
              {!!f!.includeCid && (
                <label className="block"><span className={label}>{t("cid")}</span>
                  <input value={(f!.cid as string) ?? ""} maxLength={20} onChange={(e) => setF({ cid: e.target.value } as Partial<CertificateFields>)} className={input} />
                </label>
              )}
            </>
          )}

          {type === "declaration" && (
            <>
              <label className="block"><span className={label}>{t("visitDate")}</span>
                <DateInput value={(f!.date as string) ?? ""} onChange={(v) => setF({ date: v } as Partial<DeclarationFields>)} className={input} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={label}>{t("timeFrom")}</span>
                  <input type="time" value={(f!.from as string) ?? ""} onChange={(e) => setF({ from: e.target.value } as Partial<DeclarationFields>)} className={input} />
                </label>
                <label className="block"><span className={label}>{t("timeTo")}</span>
                  <input type="time" value={(f!.to as string) ?? ""} onChange={(e) => setF({ to: e.target.value } as Partial<DeclarationFields>)} className={input} />
                </label>
              </div>
              <label className="block"><span className={label}>{t("companion")}</span>
                <input value={(f!.companion as string) ?? ""} maxLength={120} onChange={(e) => setF({ companion: e.target.value } as Partial<DeclarationFields>)} className={input} />
              </label>
            </>
          )}

          {type === "exam_request" && (
            <>
              <label className="block"><span className={label}>{t("exams")}</span>
                <textarea rows={5} value={((f!.exams as string[]) ?? []).join("\n")} onChange={(e) => setF({ exams: e.target.value.split("\n") } as Partial<ExamRequestFields>)} className={`${input} resize-y`} />
              </label>
              <label className="block"><span className={label}>{t("clinicalIndication")}</span>
                <input value={(f!.indication as string) ?? ""} maxLength={300} onChange={(e) => setF({ indication: e.target.value } as Partial<ExamRequestFields>)} className={input} />
              </label>
              <label className="block"><span className={label}>{t("cid")}</span>
                <input value={(f!.cid as string) ?? ""} maxLength={20} onChange={(e) => setF({ cid: e.target.value } as Partial<ExamRequestFields>)} className={input} />
              </label>
            </>
          )}

          {type === "controlled_prescription" && (
            <>
              {!hasPatientId && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{t("controlledNeedsId")}</p>}
              <span className={label}>{t("items")}</span>
              {((f!.items as ControlledFields["items"]) ?? []).map((it, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-3">
                  {(["name", "dose", "quantity"] as const).map((k) => (
                    <input key={k} aria-label={t(k === "name" ? "itemName" : k)} placeholder={t(k === "name" ? "itemName" : k)} value={it[k]} maxLength={200}
                      onChange={(e) => setF({ items: (f!.items as ControlledFields["items"]).map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) } as Partial<ControlledFields>)}
                      className={input} />
                  ))}
                  <input aria-label={t("posology")} placeholder={t("posology")} value={it.posology} maxLength={500}
                    onChange={(e) => setF({ items: (f!.items as ControlledFields["items"]).map((x, j) => (j === i ? { ...x, posology: e.target.value } : x)) } as Partial<ControlledFields>)}
                    className={`${input} sm:col-span-3`} />
                </div>
              ))}
              {((f!.items as unknown[]) ?? []).length < 10 && (
                <button type="button" onClick={() => setF({ items: [...(f!.items as ControlledFields["items"]), { name: "", dose: "", quantity: "", posology: "" }] } as Partial<ControlledFields>)}
                  className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">+ {t("addItem")}</button>
              )}
            </>
          )}

          {type === "th_certificate" && (
            <>
              <label className="block"><span className={label}>{t("examDate")}</span>
                <DateInput value={(f!.examDate as string) ?? ""} onChange={(v) => setF({ examDate: v } as Partial<ThCertificateFields>)} className={input} />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!f!.rest} onChange={(e) => setF({ rest: e.target.checked ? { days: 1, start: today(timeZone), end: today(timeZone) } : undefined } as Partial<ThCertificateFields>)} className="h-4 w-4 accent-teal-600" />
                {t("rest")}
              </label>
              {!!f!.rest && (
                <div className="grid grid-cols-3 gap-3">
                  {(["days", "start", "end"] as const).map((k) => (
                    <label key={k} className="block"><span className={label}>{t(k === "days" ? "days" : k === "start" ? "startDate" : "endDate")}</span>
                      {k === "days" ? (
                        <input type="number" min={1} value={String((f!.rest as Record<string, unknown>).days ?? "")}
                          onChange={(e) => setRest({ days: Number(e.target.value) })} className={input} />
                      ) : (
                        <DateInput value={String((f!.rest as Record<string, unknown>)[k] ?? "")} onChange={(v) => setRest({ [k]: v })} className={input} />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {type !== "exam_request" && type !== "controlled_prescription" && (
            <label className="block">
              <span className={label}>{type === "th_certificate" ? t("findings") : t("body")}</span>
              <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={`${input} resize-y`} />
              {edited && (type === "certificate" || type === "declaration") && (
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {fieldsChanged && <span role="status" data-testid="text-mismatch" className="text-xs text-amber-700">{t("textMayNotMatch")}</span>}
                  <button type="button" onClick={() => setBody(generated)} className="text-xs font-semibold text-teal-700 underline">{t("refill")}</button>
                </span>
              )}
            </label>
          )}

          {state.mode === "correct" && reasonField}
          {shareShown && (
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" data-testid="share-with-patient" checked={share} disabled={shareState === "checking"}
                  ref={(el) => { if (el) el.indeterminate = shareState === "unknown"; }}
                  onChange={(e) => { shareTouched.current = true; setShareState("known"); setShare(e.target.checked); }} className="h-4 w-4 accent-teal-600" />
                {tdocs("share")}
              </label>
              {shareState === "checking" && <p role="status" className="mt-1 text-xs text-slate-500">{tdocs("shareChecking")}</p>}
              {shareState === "unknown" && <p role="alert" className="mt-1 text-xs text-amber-700">{tdocs("shareCheckFailed")}</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">{tp("cancel")}</button>
            <button type="submit" disabled={pending || shareWaits} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {pending ? tp("saving") : state.mode === "correct" ? tp("addCorrection") : t("save")}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// ── The PDF (the website's renderer, the app's layout) ───────────────────────

async function fetchBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// The document's PDF, made in the browser once the access is logged
// (documentPrintData fails closed). Returns the bytes, or an error code.
// withSignature: only the patient's copy made when the document is issued
// (02, 10-13); downloads and prints show the typed stamp only.
export async function makeDocumentPdf(patientId: string, doc: MedDoc, words: { footer: string; unsignedCopy: string | null }, opts: { withSignature?: boolean } = {}):
  Promise<{ ok: true; bytes: Uint8Array } | { ok: false; code: string }> {
  const r = await documentPrintData(patientId, doc.id);
  if (!r.ok) return r;
  const d = r.data;
  // The controlled prescription is a legal layout: always today's typeface.
  const fontId = doc.doc_type === "controlled_prescription" ? "sarabun" : d.fontId;
  const [fonts, logoBytes, brandLogo] = await Promise.all([loadDesignFontBytes(fontId), fetchBytes(d.template.logoUrl), fetchBytes(d.brand?.logoUrl ?? null)]);
  const brand = d.brand ? { logoBytes: brandLogo, initials: d.brand.initials, color: d.brand.color, name: d.brand.name, specialty: d.brand.specialty, registration: d.brand.registration } : null;
  const idValue = d.idKind === "cpf" ? (d.patient.cpf ? formatCpfDigits(d.patient.cpf) : null) : d.idKind === "thai_id" ? d.patient.thId ?? d.patient.passport : d.patient.passport;
  const idKind = d.idKind === "thai_id" && !d.patient.thId && d.patient.passport ? "passport" : d.idKind;
  const created = new Date(doc.created_at);
  const issuedIso = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
  if (doc.doc_type === "controlled_prescription") {
    const f = doc.fields as ControlledFields;
    const [y, m, dd] = issuedIso.split("-");
    const bytes = await renderControlledPrescriptionPdf({
      doctor: {
        // The CRM number and its UF from the saved line ("CRM 12345/SP"), as the app.
        name: d.doctor.name, ...crmIssuer(d.doctor.registration, d.doctor.state), address: d.doctor.address ?? "",
        city: d.doctor.city ?? "", cityUf: d.doctor.state ?? "", phone: d.doctor.phone,
      },
      patientName: d.patient.name,
      // The CPF, else the passport, else "não possui" (B.4).
      patientIdValue: d.patient.cpf ? formatCpfDigits(d.patient.cpf) : (d.patient.passport ? `${d.patient.passport}` : "não possui"),
      items: f.items ?? [],
      date: `${dd}/${m}/${y}`,
      template: { primaryColor: d.template.primaryColor, logoBytes },
      brand,
    }, fonts);
    return { ok: true, bytes };
  }
  // Document Studio: the whole document in the practice's saved design
  // (behind the document_studio flag; the server sends studio only then; the
  // controlled prescription returned above: a legal layout, never designed).
  if (d.studio) {
    const [studioFonts, square, wide, reversed, signatureImage] = await Promise.all([
      loadDesignFontBytes(d.studio.design.font), fetchBytes(d.studio.logos.square), fetchBytes(d.studio.logos.wide), fetchBytes(d.studio.logos.reversed),
      opts.withSignature ? signatureBytes(createClient(), d.studio.signaturePath) : Promise.resolve(null),
    ]);
    const designed = await renderDesignedDocument({
      design: d.studio.design, locale: doc.language, practice: d.studio.practice, logos: { square, wide, reversed }, signatureImage,
      doc: {
        ...medicalDocumentContent({
          type: doc.doc_type, lang: doc.language, fields: doc.fields as DocFields, body: doc.body ?? "",
          issued: issuedIso, city: d.doctor.city ?? "", place: [d.doctor.clinicName, d.doctor.address].filter(Boolean).join(" "),
          patientName: d.patient.name, patientId: idValue ? { label: idLabel(doc.language, idKind), value: idValue } : null,
          signerName: d.doctor.name, licenceNo: d.doctor.registration, unsignedLine: words.unsignedCopy,
        }),
        headerText: d.studio.texts.header, footerText: d.studio.texts.footer,
      },
    }, studioFonts);
    return { ok: true, bytes: designed };
  }
  const bytes = await renderMedicalDocumentPdf({
    locationLines: d.locationLines,
    type: doc.doc_type, lang: doc.language, fields: doc.fields as DocFields, body: doc.body ?? "",
    issued: issuedIso, city: d.doctor.city ?? "",
    place: [d.doctor.clinicName, d.doctor.address].filter(Boolean).join(" "),
    patientName: d.patient.name,
    patientId: idValue ? { label: idLabel(doc.language, idKind), value: idValue } : null,
    template: { primaryColor: d.template.primaryColor, footerText: d.template.footerText, logoBytes },
    // The name exactly as saved (no title prefix); the registration formatted (cf).
    brand, signerName: d.doctor.name,
    signerRegistration: registrationLine(d.country, doc.language, d.doctor.registration, d.doctor.state),
    licenceNo: d.doctor.registration,
    footer: PRINT[doc.language].footer, unsignedLine: words.unsignedCopy,
    fontId,
  }, fonts);
  return { ok: true, bytes };
}

export function downloadPdf(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
