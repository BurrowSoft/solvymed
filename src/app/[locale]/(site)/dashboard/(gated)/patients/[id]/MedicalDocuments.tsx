"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  DOC_LANGS, PRINT, docLangsFor, docLangsForType, documentTypesFor, sharesSnapshot, fixedLanguage, formatCpfDigits, idLabel, prefilledBody, registrationLine, validateFields,
  type CertificateFields, type ControlledFields, type DeclarationFields, type DocFields, type DocLang,
  type ExamRequestFields, type MedicalDocType, type ThCertificateFields,
} from "@/lib/medicalDocuments";
import { correctMedicalDocument, createMedicalDocument, documentPrintData, updateMedicalDocument } from "../medical-documents-actions";
import { loadFontBytes } from "@/lib/pdf/document";
import { renderMedicalDocumentPdf } from "@/lib/pdf/medicalDocument";
import { renderControlledPrescriptionPdf } from "@/lib/pdf/controlledPrescription";
import { DateInput } from "@/components/DateInput";
import { crmIssuer } from "@/lib/registration";

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

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function emptyFields(type: MedicalDocType): DocFields {
  switch (type) {
    case "certificate": return { variant: "absence", date: today(), days: 1, start: today(), includeCid: false } as CertificateFields;
    case "declaration": return { date: today(), from: "", to: "" } as DeclarationFields;
    case "exam_request": return { exams: [], indication: "", cid: "" } as ExamRequestFields;
    case "controlled_prescription": return { items: [{ name: "", dose: "", quantity: "", posology: "" }] } as ControlledFields;
    case "th_certificate": return { examDate: today() } as ThCertificateFields;
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

export function DocumentDialog({ state, patientId, patientName, country, hasPatientId, onClose, onSaved, onDirtyChange, reasonField, canShare = false }: {
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
  onSaved?: (saved?: { doc: MedDoc; correctsId: string | null; share: boolean }) => void;
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
  const defaultLang: DocLang = (DOC_LANGS as readonly string[]).includes(uiLocale) ? (uiLocale as DocLang) : "en";
  const [lang, setLang] = useState<DocLang>(existing?.language ?? defaultLang);
  const [fields, setFields] = useState<DocFields | null>(existing ? (existing.fields as DocFields) : type ? emptyFields(type) : null);
  const [body, setBody] = useState(existing?.body ?? "");
  // The prefilled text follows the fields until the doctor edits it.
  const [bodyTouched, setBodyTouched] = useState(!!existing);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // ON by default (the A spec); never for the controlled prescription.
  const [share, setShare] = useState(true);
  const types = documentTypesFor(country);
  const effLang = (type && fixedLanguage(type)) ?? lang;

  // Changed since it opened: the host confirms before closing, and leaving
  // the page asks too (the browser's own prompt).
  const snapshot = JSON.stringify({ type, lang, fields, body });
  const opened = useRef(snapshot);
  const dirty = snapshot !== opened.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setF = (patch: Partial<DocFields>) => {
    setFields((f) => {
      const next = { ...(f as object), ...patch } as DocFields;
      if (type && !bodyTouched) setBody(prefilledBody(type, next, effLang, patientName));
      return next;
    });
  };
  // The rest period (Thai certificate): changing the days or the start sets
  // the end to start + days − 1, as the app (12's #413 row); the end stays
  // editable.
  const setRest = (patch: Partial<NonNullable<ThCertificateFields["rest"]>>) => {
    const r = { ...((fields as ThCertificateFields).rest ?? { days: 1, start: today(), end: today() }), ...patch };
    if (("days" in patch || "start" in patch) && r.days >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(r.start)) r.end = restEnd(r.start, r.days);
    setF({ rest: r } as Partial<ThCertificateFields>);
  };
  const pick = (ty: MedicalDocType) => {
    setType(ty);
    const f = emptyFields(ty);
    setFields(f);
    setBodyTouched(false);
    // A type that doesn't offer the chosen language (the Thai certificate:
    // th / en only) starts in its first one.
    const offered = docLangsForType(ty, docLangsFor(country));
    const l = offered.includes(lang) ? lang : offered[0];
    if (l !== lang) setLang(l);
    setBody(prefilledBody(ty, f, fixedLanguage(ty) ?? l, patientName));
  };
  const changeLang = (l: DocLang) => {
    setLang(l);
    if (type && fields && !bodyTouched) setBody(prefilledBody(type, fields, l, patientName));
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !fields) return;
    const bad = validateFields(type, fields, body);
    if (bad) { setError(t(`err.${bad}`)); return; }
    const reason = (new FormData(e.currentTarget as HTMLFormElement).get("reason") as string | null) ?? "";
    setError("");
    start(async () => {
      const payload = { type, lang: effLang, fields, body };
      const r = state.mode === "new" ? await createMedicalDocument(patientId, payload)
        : state.mode === "edit" ? await updateMedicalDocument(state.doc.id, patientId, payload)
        : await correctMedicalDocument(state.doc.id, patientId, { ...payload, reason });
      if (!r.ok) {
        const k = r.code.startsWith("field_") ? r.code.slice(6) : null;
        setError(k ? t(`err.${k}` as "err.date") : r.code === "buddhist_year" ? tdate("buddhistYear") : r.code === "reason_required" ? tp("reasonRequired") : r.code === "clinical_record_locked" ? tp("lockedError") : tp("genericError"));
        return;
      }
      // The saved document, as the PDF needs it (the server's copy is the same).
      // An edit (within 24 h) keeps its id: its new copy replaces the old one (86).
      const id = state.mode === "edit" ? state.doc.id : (r.data as string | null);
      if (onSaved) {
        onSaved(id && type ? {
          doc: { id, doc_type: type, language: effLang, fields: fields as Record<string, unknown>, body: body.trim() || null, created_at: new Date().toISOString() } as MedDoc,
          correctsId: state.mode === "new" ? null : state.doc.id,
          share: canShare && share && sharesSnapshot(type),
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
                <input type="checkbox" checked={!!f!.rest} onChange={(e) => setF({ rest: e.target.checked ? { days: 1, start: today(), end: today() } : undefined } as Partial<ThCertificateFields>)} className="h-4 w-4 accent-teal-600" />
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
              <textarea rows={5} value={body} onChange={(e) => { setBody(e.target.value); setBodyTouched(true); }} className={`${input} resize-y`} />
              {bodyTouched && (type === "certificate" || type === "declaration") && (
                <button type="button" onClick={() => { setBodyTouched(false); setBody(prefilledBody(type, fields, effLang, patientName)); }} className="mt-1 text-xs font-semibold text-teal-700 underline">{t("refill")}</button>
              )}
            </label>
          )}

          {state.mode === "correct" && reasonField}
          {canShare && type && sharesSnapshot(type) && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 accent-teal-600" />
              {tdocs("share")}
            </label>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">{tp("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">
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
export async function makeDocumentPdf(patientId: string, doc: MedDoc, words: { footer: string; unsignedCopy: string | null }):
  Promise<{ ok: true; bytes: Uint8Array } | { ok: false; code: string }> {
  const r = await documentPrintData(patientId, doc.id);
  if (!r.ok) return r;
  const d = r.data;
  const [fonts, logoBytes, brandLogo] = await Promise.all([loadFontBytes(), fetchBytes(d.template.logoUrl), fetchBytes(d.brand?.logoUrl ?? null)]);
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
