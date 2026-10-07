"use client";

import { createContext, useContext, useState, useTransition, useRef, useEffect } from "react";
import { MergePatientButton } from "./MergePatient";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { createRecord, deleteRecord, updateRecord, addRecordCorrection, createPrescription, deletePrescription, updatePrescription, addPrescriptionCorrection, updatePatient, deletePatient, toggleBookingBlock, generatePatientInviteCode, getArchivePreview, archivePatient, restorePatient, loadAccessLog } from "../actions";
import { archivedLabel } from "../PatientsClient";
import { accessKindLabelKey, fileNameFromRef, type AccessLogPage, type AccessLogRow } from "@/lib/accessLog";
import { dateLocale, formatDateLabel, formatShortDate, plainSpaces } from "@/lib/dateLabels";
import { localDay } from "@/lib/patientDocuments";
import { usePatientIdFields } from "@/lib/usePatientIdFields";
import type { PatientIdKind } from "@/lib/patientIds";
import { DateInput } from "@/components/DateInput";
import { FilesTab } from "./FilesTab";
import { DocumentsTab } from "./DocumentsTab";
import { DocumentDialog, downloadPdf, makeDocumentPdf, type DocDialogState, type MedDoc } from "./MedicalDocuments";
import { printPdf } from "@/lib/printPdf";
import { deleteMedicalDocument } from "../medical-documents-actions";
import { loadPatientDocuments } from "../documents-actions";
import { AddressFields } from "@/components/patient/AddressFields";
import { addressLine, type AddressColumns } from "@/lib/patientAddress";
import { profileOfKind } from "@/lib/country";
import { hasAmount } from "@/lib/paymentRules";
import { ConsultTypeLabel } from "@/components/ConsultTypeLabel";
import { usePracticeCalendar } from "@/components/PracticeCalendar";
import { composeRecordContent } from "@/lib/recordPresets";
import { switchTemplate, type RecordSection, type RecordTemplate } from "@/lib/recordTemplates";
import { recordTypeKey, recordTypeLabelKey } from "@/lib/recordTypes";

// Clinical entries (migration 097): the author and correction fields are
// set by the server. A correction is its own row pointing at the original
// (corrects_id) with a required reason.
type ClinicalMeta = {
  created_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  corrects_id?: string | null;
  correction_reason?: string | null;
};
// template_name + sections: a record written with a template (1.8.0 D, 189).
export type MedRecord = ClinicalMeta & { id: string; date: string; time: string; content: string; record_type?: string; template_name?: string | null; sections?: RecordSection[] | null };
type RxItem = { name: string; dosage: string; frequency: string; duration: string };
export type Rx = ClinicalMeta & { id: string; date: string; notes?: string; prescription_items: RxItem[] };
type Appt = { id: string; date: string; start_time: string; consultation_type: string; status: string; payment_status: string; payment_amount?: number | null };
type Patient = {
  id: string; full_name: string; email?: string; phone?: string; cpf?: string;
  // Migration 110 (Thai / other-country practices); absent before it.
  th_national_id?: string | null; passport_number?: string | null;
  sex?: string; birth_date?: string; profession?: string; emergency_phone?: string;
  convenio_type?: string; invite_code?: string; created_at: string;
  booking_blocked?: boolean;
  // Set by a server trigger on insert (migration 088); can't be forged.
  professional_id?: string; created_by?: string | null; created_by_name?: string | null;
} & AddressColumns;

// The clinic's time zone for timestamps shown as dates ("Paciente desde",
// corrections): formatting in the runtime's zone gave the server (UTC) and
// the browser different days near midnight (React #418).
const TimeZoneContext = createContext<string | undefined>(undefined);

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>;
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${className}`} {...props} />;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white" {...props}>
      {children}
    </select>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-700";
    case "scheduled": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-500";
  }
}

export function PatientTabs({ patient, records, prescriptions, appointments, locale, isSecretary = false, isArchived = false, canDelete = false, hasAppointments = false, canMerge = false, mergeWith = null, currentUserId, idKind = "BR", accessLog = null, addressLive = false, timeZone, recordTemplates = null, documentsOn = false, medicalDocs = null }: {
  patient: Patient;
  records: MedRecord[];
  prescriptions: Rx[];
  appointments: Appt[];
  locale: string;
  isSecretary?: boolean;
  // Archived patients are read-only for new clinical entries and bookings
  // (the server refuses them too, with patient_archived).
  isArchived?: boolean;
  // Only a patient without clinical history can be deleted.
  canDelete?: boolean;
  hasAppointments?: boolean;
  // Mesclar com outro paciente (133): the doctor, once the database has it.
  canMerge?: boolean;
  // Open the merge with this record (the invited patient's same-email prompt).
  mergeWith?: string | null;
  // Records and prescriptions can be edited or deleted only by their author.
  currentUserId: string;
  // The practice country's patient ID (lib/patientIds).
  idKind?: PatientIdKind;
  // The access log's first page (doctor only; null = no tab: before
  // migration 111, or a secretary).
  accessLog?: AccessLogPage | "failed" | null;
  // Address, CNS and Observações (138): shown and edited once it's applied.
  addressLive?: boolean;
  // The clinic's (IANA); dates of timestamps are shown in it.
  timeZone?: string;
  // The doctor's record templates (1.8.0 D); null while the flag is off.
  recordTemplates?: RecordTemplate[] | null;
  // 1.8.0 A (flag 'patient_documents', the doctor): Documents replaces Exams + Files.
  documentsOn?: boolean;
  // 1.8.0 B (flag 'clinical_documents', the doctor): the patient's documents
  // in "Receitas e documentos" (cf); null = the flag is off.
  medicalDocs?: { list: MedDoc[]; country: string; hasPatientId: boolean } | null;
}) {
  const t = useTranslations("patientDetail");
  const td = useTranslations("docs");
  const tDocs = useTranslations("documents");
  const [tab, setTab] = useState<"info" | "records" | "prescriptions" | "exams" | "files" | "documents" | "appointments" | "access">("info");
  const ALL_TABS = [
    { key: "info" as const, label: t("tabInfo") },
    { key: "records" as const, label: t("tabRecords", { n: records.length }) },
    { key: "prescriptions" as const, label: medicalDocs ? tDocs("tabTitle", { n: prescriptions.filter((x) => !x.corrects_id).length + medicalDocs.list.filter((x) => !x.corrects_id).length }) : t("tabPrescriptions", { n: prescriptions.length }) },
    ...(documentsOn
      ? [{ key: "documents" as const, label: td("tab") }]
      : [{ key: "exams" as const, label: t("tabExams") }, { key: "files" as const, label: t("tabFiles") }]),
    { key: "appointments" as const, label: t("tabAppointments", { n: appointments.length }) },
    { key: "access" as const, label: t("tabAccessLog") },
  ];
  const TABS = ALL_TABS.filter(tb =>
    (!isSecretary || !["records", "prescriptions", "exams", "files", "documents", "access"].includes(tb.key)) &&
    (tb.key !== "access" || accessLog != null),
  );

  return (
    <TimeZoneContext.Provider value={timeZone}>
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-slate-100 mb-6 overflow-x-auto">
        {TABS.map(tab_item => (
          <button
            key={tab_item.key}
            onClick={() => setTab(tab_item.key)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === tab_item.key
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab_item.label}
          </button>
        ))}
      </div>

      {tab === "info" && <PatientInfoTab patient={patient} locale={locale} isArchived={isArchived} canDelete={canDelete} hasAppointments={hasAppointments} canMerge={canMerge} mergeWith={mergeWith} idKind={idKind} addressLive={addressLive} />}
      {tab === "records" && <RecordsTab patientId={patient.id} records={records} isArchived={isArchived} currentUserId={currentUserId} locale={locale} templates={recordTemplates ?? []} />}
      {tab === "prescriptions" && <PrescriptionsTab patientId={patient.id} patientName={patient.full_name} prescriptions={prescriptions} isArchived={isArchived} currentUserId={currentUserId} locale={locale} medicalDocs={medicalDocs} />}
      {(tab === "exams" || tab === "files") && !isSecretary && (
        <FilesTab key={tab} patientId={patient.id} doctorId={currentUserId} kind={tab} isArchived={isArchived} locale={locale} />
      )}
      {tab === "documents" && documentsOn && !isSecretary && (
        <DocumentsTab patientId={patient.id} doctorId={currentUserId} isArchived={isArchived} locale={locale} />
      )}
      {tab === "appointments" && <AppointmentsTab appointments={appointments} locale={locale} />}
      {tab === "access" && accessLog != null && (
        <AccessLogTab patientId={patient.id} initial={accessLog} records={records} prescriptions={prescriptions} locale={locale} documentsOn={documentsOn && !isSecretary} medicalDocs={medicalDocs?.list ?? null} />
      )}
    </div>
    </TimeZoneContext.Provider>
  );
}

// Who opened this patient's record, and when (migration 111). The doctor
// only; newest first, 50 at a time.
function AccessLogTab({ patientId, initial, records, prescriptions, locale, documentsOn = false, medicalDocs = null }: {
  patientId: string;
  initial: AccessLogPage | "failed";
  records: MedRecord[];
  prescriptions: Rx[];
  locale: string;
  // 1.8.0 A: documents are named by their title (cf), "(removed)" when gone.
  documentsOn?: boolean;
  // 1.8.0 B: a document's entry names its type (cf), "(removed)" when gone.
  medicalDocs?: { id: string; doc_type: string }[] | null;
}) {
  const t = useTranslations("patientDetail");
  const tMed = useTranslations("documents");
  const practiceCalendar = usePracticeCalendar();
  const [rows, setRows] = useState<AccessLogRow[]>(initial === "failed" ? [] : initial.rows);
  const [hasMore, setHasMore] = useState(initial !== "failed" && initial.hasMore);
  const [failed, setFailed] = useState(initial === "failed");
  const [pending, startTransition] = useTransition();
  const td = useTranslations("docs");
  // The patient's documents by id and by storage path (the access log's
  // refs); null until loaded or without documents.
  const [docTitles, setDocTitles] = useState<{ byId: Map<string, string>; byPath: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!documentsOn) return;
    let alive = true;
    void loadPatientDocuments(patientId).then((r) => {
      if (!alive || !r.ok) return;
      setDocTitles({ byId: new Map(r.data.documents.map((d) => [d.id, d.title])), byPath: new Map(r.data.documents.map((d) => [d.storagePath, d.title])) });
    });
    return () => { alive = false; };
  }, [documentsOn, patientId]);
  // A document's path: <doctor>/<patient>/<uuid>.<ext> (190).
  const isDocPath = (ref: string) => /\/[0-9a-f-]{36}\.(pdf|jpg|png|heic)$/i.test(ref);

  function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    startTransition(async () => {
      const next = await loadAccessLog(patientId, last.at, locale);
      if (next === "failed" || next === null) { setFailed(true); return; }
      setRows((r) => [...r, ...next.rows]);
      setHasMore(next.hasMore);
    });
  }

  // When, in the VIEWER's time zone and the reader's calendar (cf: system
  // dates, one zone per page, as the documents list). The tab renders only
  // after a click, in the browser, so this never differs from a server render.
  const fmtWhen = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium", timeStyle: "short" });
  const whenLocal = (r: AccessLogRow) => {
    const d = new Date(r.at);
    return Number.isNaN(d.getTime()) ? r.when : plainSpaces(fmtWhen.format(d));
  };

  const who = (r: AccessLogRow) =>
    r.actorRole === "patient" ? t("accessRolePatient")
      : `${r.actorName} · ${r.actorRole === "secretary" ? t("accessRoleSecretary") : t("accessRoleProfessional")}`;

  const what = (r: AccessLogRow) => {
    if (r.kind === "record" || r.kind === "exam") {
      const rec = records.find((x) => x.id === r.objectRef);
      const label = r.kind === "exam" ? t("accessKindExam") : t("accessKindRecord");
      if (!rec) return label;
      const key = recordTypeKey(rec.record_type);
      const type = key !== "free_text" ? ` · ${t(recordTypeLabelKey(key))}` : "";
      return `${label}${type} · ${formatDateLabel(locale, rec.date, { year: "numeric", month: "short", day: "numeric" }, practiceCalendar)}`;
    }
    if (r.kind === "prescription") {
      const rx = prescriptions.find((x) => x.id === r.objectRef);
      return rx ? `${t("accessKindPrescription")} · ${formatDateLabel(locale, rx.date, { year: "numeric", month: "short", day: "numeric" }, practiceCalendar)}` : t("accessKindPrescription");
    }
    if (medicalDocs && r.kind === "document") {
      const doc = medicalDocs.find((x) => x.id === r.objectRef);
      return `${t(accessKindLabelKey(r.kind))} · ${doc ? tMed(`type.${doc.doc_type}`) : td("removedMark")}`;
    }
    if (docTitles && (r.kind === "shared_document" || r.kind === "patient_upload" || r.kind === "patient_upload_removed")) {
      return `${t(accessKindLabelKey(r.kind))} · ${docTitles.byId.get(r.objectRef ?? "") ?? td("removedMark")}`;
    }
    if (docTitles && (r.kind === "file" || r.kind === "file_deleted") && isDocPath(r.objectRef ?? "")) {
      const label = r.kind === "file" ? t("accessKindFile") : t(accessKindLabelKey(r.kind));
      return `${label} · ${docTitles.byPath.get(r.objectRef ?? "") ?? td("removedMark")}`;
    }
    if (r.kind === "file") {
      const name = fileNameFromRef(r.objectRef);
      return name ? `${t("accessKindFile")} · ${name}` : t("accessKindFile");
    }
    // {name}: a merge's ref is the removed record's name (133).
    return t(accessKindLabelKey(r.kind), { name: r.objectRef || "—" });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">{t("accessLogIntro")}</p>
      {failed && <p className="mb-4 text-sm text-red-600">{t("accessLogFailed")}</p>}
      {!failed && rows.length === 0 && <p className="text-sm text-slate-400">{t("accessLogEmpty")}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4 font-semibold">{t("accessColWhen")}</th>
                <th className="py-2 pr-4 font-semibold">{t("accessColWho")}</th>
                <th className="py-2 font-semibold">{t("accessColWhat")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.at}-${i}`} className="border-b border-slate-50 align-top">
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{whenLocal(r)}</td>
                  <td className="py-2 pr-4 text-slate-800">{who(r)}</td>
                  <td className="py-2 text-slate-600">{what(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && !failed && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {t("accessLogMore")}
        </button>
      )}
    </div>
  );
}

function PatientInfoTab({ patient, locale, isArchived, canDelete, hasAppointments = false, canMerge = false, mergeWith = null, idKind, addressLive = false }: { patient: Patient; locale: string; isArchived: boolean; canDelete: boolean; hasAppointments?: boolean; canMerge?: boolean; mergeWith?: string | null; idKind: PatientIdKind; addressLive?: boolean }) {
  const t = useTranslations("patientDetail");
  const tIds = useTranslations("patientIds");
  const tBirth = useTranslations("dateInput");
  const tAddr = useTranslations("patientAddress");
  const timeZone = useContext(TimeZoneContext);
  // CPF, Thai ID/passport or passport/ID, by the practice's country.
  const idFields = usePatientIdFields(idKind, patient);
  // Server codes become translated copy, never raw codes or database text.
  const errorText = (e: string) =>
    e === "patient_archived" ? t("archivedNoNew")
    : e === "patient_has_clinical_history" ? t("deleteHasHistory")
    : e === "patient_has_appointments" ? t("deleteHasAppointments")
    : e === "name_required" ? t("nameRequired")
    : e === "invalid_th_id" ? tIds("thaiIdInvalid")
    : e === "invalid_birth_date" ? tBirth("invalidBirthDate")
    : e === "birth_year_buddhist" ? tBirth("buddhistYear")
    : e === "invalid_cns" ? tAddr("invalidCns")
    : e === "unauthorized" ? t("sessionError")
    : t("genericError");
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Delete refused (history or appointments added since the page loaded):
  // the message comes with an Arquivar button.
  const [offerArchive, setOfferArchive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [blockPending, startBlockTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;

  const [inviteCode, setInviteCode] = useState(patient.invite_code ?? null);
  const [codePending, startCodeTransition] = useTransition();
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeError, setCodeError] = useState("");

  function handleGenerateCode() {
    setCodeError("");
    startCodeTransition(async () => {
      const result = await generatePatientInviteCode(patient.id);
      if (result.error) { setCodeError(errorText(result.error)); return; }
      if (result.code) setInviteCode(result.code);
    });
  }

  function handleCopyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }).catch(() => {});
  }

  function handleToggleBlock() {
    startBlockTransition(async () => {
      await toggleBookingBlock(patient.id, !patient.booking_blocked);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await updatePatient(patient.id, formData);
      if (result?.error) {
        // The fields shown were for another country: reload them.
        if (result.error === "id_kind_mismatch") router.refresh();
        setError(errorText(result.error));
        return;
      }
      setEditing(false);
    });
  }

  // With appointments it can't be deleted (as app #299): say why, offer
  // Arquivar / Cancelar; nothing is sent.
  const [blockedOpen, setBlockedOpen] = useState(false);
  function handleDelete() {
    if (hasAppointments) { setError(""); setOfferArchive(false); setBlockedOpen(true); return; }
    if (!confirm(t("deleteNoHistoryConfirm", { name: patient.full_name }))) return;
    setError("");
    setOfferArchive(false);
    startTransition(async () => {
      const result = await deletePatient(patient.id);
      if (result?.error) {
        // History or an appointment was added since the page loaded:
        // archive instead.
        const inUse = result.error === "patient_has_clinical_history" || result.error === "patient_has_appointments";
        setError(result.error === "patient_has_clinical_history" ? t("deleteHasHistory") : result.error === "patient_has_appointments" ? t("deleteHasAppointments") : t("deleteError"));
        setOfferArchive(inUse && !isArchived);
        return;
      }
      router.push(`${prefix}/dashboard/patients`);
    });
  }

  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const fields = [
    { label: t("email"), value: patient.email },
    { label: t("phone"), value: patient.phone },
    ...idFields.map((f) => ({ label: f.label, value: f.value || null })),
    { label: t("dateOfBirth"), value: patient.birth_date ? `${formatShortDate(locale, patient.birth_date)}${age ? ` (${t("age", { n: age })})` : ""}` : null },
    { label: t("sex"), value: patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : null },
    { label: t("profession"), value: patient.profession },
    { label: t("emergencyPhone"), value: patient.emergency_phone },
    ...(addressLive ? [
      { label: tAddr("cns"), value: profileOfKind(idKind).healthCard === "cns" ? patient.cns ?? null : null },
      { label: tAddr("notes"), value: patient.notes_admin ?? null },
    ] : []),
    { label: t("insurance"), value: patient.convenio_type === "health_plan" ? t("healthPlan") : patient.convenio_type === "particular" ? t("privateInsurance") : null },
    { label: t("patientSince"), value: new Date(patient.created_at).toLocaleDateString(dateLocale(locale), { year: "numeric", month: "long", day: "numeric", timeZone }) },
    // Only when someone other than the doctor (i.e. a secretary) added
    // the patient.
    {
      label: t("addedBy"),
      value: patient.created_by && patient.created_by !== patient.professional_id && patient.created_by_name
        ? t("addedBySecretary", {
            name: patient.created_by_name,
            date: new Date(patient.created_at).toLocaleDateString(dateLocale(locale), { year: "numeric", month: "short", day: "numeric", timeZone }),
          })
        : null,
    },
  ];

  if (!editing) {
    return (
      <div>
        {patient.booking_blocked && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-red-600">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <p className="text-sm font-bold text-red-700">{t("blockedTitle")}</p>
              <p className="text-xs text-red-600 mt-0.5">{t("blockedSub")}</p>
            </div>
          </div>
        )}
        {!isArchived && <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("inviteCode")}</p>
          {inviteCode ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base font-bold tracking-widest text-slate-900">
                {inviteCode}
              </span>
              <button type="button" onClick={handleCopyCode} className="text-sm font-semibold text-slate-500 hover:text-slate-700 transition">
                {codeCopied ? t("codeCopied") : t("copyCode")}
              </button>
              <button type="button" onClick={handleGenerateCode} disabled={codePending} className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition disabled:opacity-60">
                {codePending ? "…" : t("regenerateCode")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerateCode}
              disabled={codePending}
              className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60"
            >
              {codePending ? "…" : t("generateCode")}
            </button>
          )}
          {codeError && <p className="mt-2 text-xs text-red-600">{codeError}</p>}
        </div>}
        {addressLive && addressLine(patient, idKind) && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tAddr("section")}</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{addressLine(patient, idKind)}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-sm font-semibold text-teal-600 hover:text-teal-700 transition">{tAddr("editAddress")}</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(({ label, value }) => value ? (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
            </div>
          ) : null)}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => setEditing(true)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            {t("editPatient")}
          </button>
          {!isArchived && <button
            onClick={handleToggleBlock}
            disabled={blockPending}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
              patient.booking_blocked
                ? "border-green-200 text-green-700 hover:bg-green-50"
                : "border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            {blockPending ? "…" : patient.booking_blocked ? t("unblockBookings") : t("blockBookings")}
          </button>}
          {!isArchived && (
            <button onClick={() => setArchiveOpen(true)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              {t("archivePatient")}
            </button>
          )}
          {canMerge && <MergePatientButton patientId={patient.id} patientName={patient.full_name} locale={locale} pairWith={mergeWith} />}
          {canDelete && (
            <button onClick={handleDelete} disabled={pending} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
              {t("deletePatient")}
            </button>
          )}
        </div>
        {blockedOpen && (
          <div role="alertdialog" aria-labelledby="delete-blocked-text" data-testid="delete-blocked" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p id="delete-blocked-text" className="text-sm text-amber-800">{t("deleteHasAppointments")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!isArchived && (
                <button onClick={() => { setBlockedOpen(false); setArchiveOpen(true); }} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition">
                  {t("archivePatient")}
                </button>
              )}
              <button onClick={() => setBlockedOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {offerArchive && (
          <button onClick={() => { setOfferArchive(false); setError(""); setArchiveOpen(true); }} className="mt-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            {t("archivePatient")}
          </button>
        )}
        <ArchiveDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} patient={patient} />
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Which ID fields this form shows; the action refuses a mismatch. */}
      <input type="hidden" name="id_kind" value={idKind} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <FieldLabel>{t("fullName")} *</FieldLabel>
          <Input name="full_name" required defaultValue={patient.full_name} />
        </div>
        <div>
          <FieldLabel>{t("email")}</FieldLabel>
          <Input name="email" type="email" defaultValue={patient.email ?? ""} />
        </div>
        <div>
          <FieldLabel>{t("phone")}</FieldLabel>
          <Input name="phone" defaultValue={patient.phone ?? ""} />
        </div>
        {idFields.map((f) => (
          <div key={f.name}>
            <FieldLabel>{f.label}</FieldLabel>
            <Input name={f.name} defaultValue={f.value} placeholder={f.placeholder} inputMode={f.inputMode} maxLength={f.maxLength} />
          </div>
        ))}
        <div>
          <FieldLabel>{t("dateOfBirth")}</FieldLabel>
          <DateInput birthDate name="birth_date" defaultValue={patient.birth_date ?? ""} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
        </div>
        <div>
          <FieldLabel>{t("sex")}</FieldLabel>
          <Select name="sex" defaultValue={patient.sex ?? ""}>
            <option value="">{t("notSpecified")}</option>
            <option value="male">{t("male")}</option>
            <option value="female">{t("female")}</option>
            <option value="other">{t("other")}</option>
          </Select>
        </div>
        <div>
          <FieldLabel>{t("insurance")}</FieldLabel>
          <Select name="convenio_type" defaultValue={patient.convenio_type ?? ""}>
            <option value="">{t("notSpecified")}</option>
            <option value="particular">{t("privateInsurance")}</option>
            <option value="health_plan">{t("healthPlan")}</option>
          </Select>
        </div>
        <div className="col-span-2">
          <FieldLabel>{t("profession")}</FieldLabel>
          <Input name="profession" defaultValue={patient.profession ?? ""} />
        </div>
        <div className="col-span-2">
          <FieldLabel>{t("emergencyPhone")}</FieldLabel>
          <Input name="emergency_phone" defaultValue={patient.emergency_phone ?? ""} />
        </div>
      </div>
      {addressLive && <AddressFields kind={idKind} values={patient} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
        <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
          {pending ? t("saving") : t("saveChanges")}
        </button>
      </div>
    </form>
  );
}

// ─── Clinical entries: the 24-hour rule (migration 097) ──────────────────────
// Within 24 hours of creation, an entry's author can edit or delete it.
// After that it can't change: "Add correction" creates a new entry that
// points at it (corrects_id) with a required reason, and the original is
// shown struck through with the correction trail. The server enforces all
// of this; the UI only offers what will work. Edit stops being offered 5
// minutes before the window closes, so a save never straddles the cutoff.
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EDIT_SAFETY_MS = 5 * 60 * 1000;

function canEditEntry(entry: ClinicalMeta, currentUserId: string): boolean {
  const age = Date.now() - new Date(entry.created_at).getTime();
  return entry.created_by === currentUserId && age < EDIT_WINDOW_MS - EDIT_SAFETY_MS;
}

// Top-level entries (not corrections) in the given order, plus each entry's
// corrections, oldest first.
function groupCorrections<T extends ClinicalMeta & { id: string }>(rows: T[]) {
  const correctionsOf = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.corrects_id) continue;
    const list = correctionsOf.get(row.corrects_id) ?? [];
    list.push(row);
    correctionsOf.set(row.corrects_id, list);
  }
  for (const list of correctionsOf.values()) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return { originals: rows.filter((r) => !r.corrects_id), correctionsOf };
}

// Server codes → translated copy; other messages are shown as they are.
function useClinicalErrorText() {
  const t = useTranslations("patientDetail");
  return (e: string) => {
    switch (e) {
      case "patient_archived": return t("archivedNoNew");
      case "clinical_record_locked": return t("lockedError");
      case "reason_required": return t("reasonRequired");
      case "content_required": return t("contentRequired");
      case "record_not_found":
      case "prescription_not_found": return t("entryNotFound");
      case "medication_required": return t("medicationRequired");
      case "not_doctor": return t("notDoctorError");
      case "unauthorized": return t("sessionError");
      // Anything else (check_failed, generic, or a raw database message
      // from actionError's fallback) is never shown as-is.
      default: return t("genericError");
    }
  };
}

function CorrectionTrail({ correction, locale }: { correction: ClinicalMeta; locale: string }) {
  const t = useTranslations("patientDetail");
  const timeZone = useContext(TimeZoneContext);
  const date = new Date(correction.created_at).toLocaleDateString(dateLocale(locale), { year: "numeric", month: "short", day: "numeric", timeZone });
  const reason = correction.correction_reason ?? "";
  return (
    <p className="text-xs font-medium text-amber-800">
      {correction.created_by_name
        ? t("correctedOnBy", { date, name: correction.created_by_name, reason })
        : t("correctedOn", { date, reason })}
    </p>
  );
}

function EntryActions({ editable, isArchived, onEdit, onDelete, onCorrect, pending }: {
  editable: boolean; isArchived: boolean; onEdit: () => void; onDelete: () => void; onCorrect: () => void; pending: boolean;
}) {
  const t = useTranslations("patientDetail");
  if (isArchived) return null;
  const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60";
  return editable ? (
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} disabled={pending} className={`${btn} text-slate-600 hover:bg-slate-100`}>{t("editEntry")}</button>
      <button type="button" onClick={onDelete} disabled={pending} className={`${btn} text-red-600 hover:bg-red-50`}>{t("deleteEntry")}</button>
    </div>
  ) : (
    <button type="button" onClick={onCorrect} disabled={pending} className={`${btn} text-teal-700 hover:bg-teal-50`}>{t("addCorrection")}</button>
  );
}

function ReasonField({ required = true }: { required?: boolean }) {
  const t = useTranslations("patientDetail");
  return (
    <div>
      <FieldLabel>{t("correctionReason")} *</FieldLabel>
      <Input name="reason" required={required} placeholder={t("correctionReasonPlaceholder")} />
    </div>
  );
}

// ─── Records ─────────────────────────────────────────────────────────────────

type RecordDialog = { mode: "new" } | { mode: "edit"; record: MedRecord } | { mode: "correct"; record: MedRecord };

// The sections being written: a template's (new record) or the record's own
// copy (edit / correction). hint = the template's placeholder.
type SectionDraft = { title: string; hint?: string; text: string };
type SectionsState = { templateId?: string; templateName: string | null; rows: SectionDraft[] } | null;

function RecordsTab({ patientId, records, isArchived, currentUserId, locale, templates = [] }: {
  patientId: string; records: MedRecord[]; isArchived: boolean; currentUserId: string; locale: string; templates?: RecordTemplate[];
}) {
  const t = useTranslations("patientDetail");
  const tt = useTranslations("recordTemplates");
  const [sections, setSections] = useState<SectionsState>(null);
  // The free-text box (controlled, so switching templates can carry its text).
  const [freeText, setFreeText] = useState("");
  // The section that received the doctor's text when switching (cf: never lost).
  const [movedTo, setMovedTo] = useState<string | null>(null);
  // The last switch only (cf): going straight back to the template (or "No
  // template") it came from, with no edit in between, restores exactly what
  // was there. Any edit forgets it.
  const [lastSwitch, setLastSwitch] = useState<{ fromId: string; sections: SectionsState; freeText: string } | null>(null);
  const practiceCalendar = usePracticeCalendar();
  const errorText = useClinicalErrorText();
  const [dialog, setDialog] = useState<RecordDialog | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { originals, correctionsOf } = groupCorrections(records);

  function open(d: RecordDialog) {
    setError("");
    // A record written with sections is edited / corrected with the same ones.
    const own = d.mode !== "new" ? d.record.sections : null;
    setSections(own ? { templateName: d.mode !== "new" ? d.record.template_name ?? null : null, rows: own.map((x) => ({ title: x.title, text: x.text })) } : null);
    setFreeText(d.mode !== "new" && !own ? d.record.content : "");
    setMovedTo(null);
    setLastSwitch(null);
    setDialog(d);
  }

  function pickTemplate(id: string) {
    if (lastSwitch && id === lastSwitch.fromId) {
      setSections(lastSwitch.sections);
      setFreeText(lastSwitch.freeText);
      setLastSwitch(null);
      setMovedTo(null);
      return;
    }
    setLastSwitch({ fromId: sections?.templateId ?? "", sections, freeText });
    const tpl = templates.find((x) => x.id === id) ?? null;
    const r = switchTemplate(sections ? { kind: "sections", rows: sections.rows } : { kind: "free", text: freeText }, tpl?.sections ?? null);
    if (r.draft.kind === "free" || !tpl) {
      setSections(null);
      setFreeText(r.draft.kind === "free" ? r.draft.text : "");
    } else {
      setSections({ templateId: tpl.id, templateName: tpl.name, rows: r.draft.rows });
    }
    setMovedTo(r.movedTo);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const formData = new FormData(formRef.current!);
    if (sections) {
      const rows = sections.rows.map((x) => ({ title: x.title, text: x.text }));
      // content stays the whole record as text, for older clients and prints.
      formData.set("content", composeRecordContent(rows));
      formData.set("sections", JSON.stringify(rows));
      formData.set("template_name", sections.templateName ?? "");
    }
    setError("");
    startTransition(async () => {
      const result =
        dialog.mode === "new" ? await createRecord(patientId, formData)
        : dialog.mode === "edit" ? await updateRecord(dialog.record.id, patientId, formData)
        : await addRecordCorrection(dialog.record.id, patientId, formData);
      if (result?.error) { setError(errorText(result.error)); return; }
      setDialog(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("deleteRecordConfirm"))) return;
    setListError("");
    startTransition(async () => {
      const result = await deleteRecord(id, patientId);
      if (result?.error) setListError(errorText(result.error));
    });
  }

  function renderRecord(r: MedRecord, depth: number): React.ReactNode {
    const corrections = correctionsOf.get(r.id) ?? [];
    const corrected = corrections.length > 0;
    return (
      <div key={r.id} className={depth === 0 ? "rounded-2xl border border-slate-100 bg-white p-5" : "mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4"}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {depth > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("correctionLabel")}</span>}
            <span className="text-xs font-semibold text-slate-500">{formatShortDate(locale, r.date, practiceCalendar)} {r.time?.slice(0, 5)}</span>
            {/* The app's English labels and the web's keys alike (cf). */}
            {recordTypeKey(r.record_type) !== "free_text" && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t(recordTypeLabelKey(recordTypeKey(r.record_type)))}</span>
            )}
            {r.template_name && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{r.template_name}</span>
            )}
          </div>
          <EntryActions
            editable={canEditEntry(r, currentUserId) && !corrected}
            isArchived={isArchived}
            pending={pending}
            onEdit={() => open({ mode: "edit", record: r })}
            onDelete={() => handleDelete(r.id)}
            onCorrect={() => open({ mode: "correct", record: r })}
          />
        </div>
        {r.sections ? (
          <div data-testid="record-sections" className={`space-y-2 text-sm leading-relaxed ${corrected ? "text-slate-400 line-through" : "text-slate-800"}`}>
            {r.sections.filter((x) => x.text.trim()).map((x, i) => (
              <div key={i}>
                <p className={`font-semibold ${corrected ? "" : "text-slate-900"}`}>{x.title}</p>
                <p className="whitespace-pre-wrap">{x.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-sm whitespace-pre-wrap leading-relaxed ${corrected ? "text-slate-400 line-through" : "text-slate-800"}`}>{r.content}</p>
        )}
        {corrections.map((c) => (
          <div key={c.id} className="mt-3">
            <CorrectionTrail correction={c} locale={locale} />
            {renderRecord(c, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  const initial = dialog && dialog.mode !== "new" ? dialog.record : null;
  const title = !dialog ? "" : dialog.mode === "new" ? t("newRecord") : dialog.mode === "edit" ? t("editRecordTitle") : t("correctRecordTitle");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{t("records", { n: originals.length })}</p>
        {!isArchived && <button onClick={() => open({ mode: "new" })} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t("newRecord")}
        </button>}
      </div>
      {listError && <p className="mb-3 text-sm text-red-600">{listError}</p>}

      {originals.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-400">{t("noRecords")}</p>
        </div>
      ) : (
        <div className="space-y-3">{originals.map((r) => renderRecord(r, 0))}</div>
      )}

      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={title}>
        {/* key: a fresh form (and defaults) for each dialog opening */}
        <form key={dialog ? `${dialog.mode}-${initial?.id ?? "new"}` : "closed"} ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {dialog?.mode === "correct" && initial && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 whitespace-pre-wrap">{initial.content}</div>
          )}
          <div>
            <FieldLabel>{t("recordType")}</FieldLabel>
            <Select name="record_type" defaultValue={recordTypeKey(initial?.record_type)}>
              <option value="free_text">{t("freeText")}</option>
              <option value="soap">{t("soapNote")}</option>
              <option value="follow_up">{t("followUp")}</option>
              <option value="surgical">{t("surgical")}</option>
              <option value="referral">{t("referral")}</option>
            </Select>
          </div>
          {dialog?.mode === "new" && templates.length > 0 && (
            <div>
              <FieldLabel>{tt("template")}</FieldLabel>
              <Select aria-label={tt("template")} value={sections?.templateId ?? ""} onChange={(e) => pickTemplate(e.target.value)}>
                <option value="">{tt("noTemplate")}</option>
                {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              {movedTo && <p role="status" className="mt-1.5 text-xs text-teal-700">{tt("textMoved", { section: movedTo })}</p>}
            </div>
          )}
          {sections ? (
            <div className="space-y-3">
              {sections.rows.map((x, i) => (
                <div key={i}>
                  <FieldLabel>{x.title}</FieldLabel>
                  <textarea
                    aria-label={x.title}
                    rows={3}
                    value={x.text}
                    placeholder={x.hint ?? ""}
                    onChange={(e) => {
                      const text = e.target.value;
                      setSections((s) => s && { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, text } : r)) });
                      setLastSwitch(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-y"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <FieldLabel>{t("content")} *</FieldLabel>
              <textarea name="content" required rows={6} value={freeText} onChange={(e) => { setFreeText(e.target.value); setLastSwitch(null); }} placeholder={t("contentPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
            </div>
          )}
          {dialog?.mode === "correct" && <ReasonField />}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDialog(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : dialog?.mode === "correct" ? t("addCorrection") : t("saveRecord")}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ─── Prescriptions ───────────────────────────────────────────────────────────

type RxDialog = { mode: "new" } | { mode: "edit"; rx: Rx } | { mode: "correct"; rx: Rx };
const EMPTY_MED: RxItem = { name: "", dosage: "", frequency: "", duration: "" };
// Each medication row gets a stable key, so removing a row from the middle
// doesn't shift the (uncontrolled) inputs' values into the wrong rows.
type MedRow = RxItem & { key: number };
let medRowKey = 0;
const medRow = (m: RxItem = EMPTY_MED): MedRow => ({ ...m, key: ++medRowKey });

function PrescriptionsTab({ patientId, patientName, prescriptions, isArchived, currentUserId, locale, medicalDocs = null }: {
  patientId: string; patientName: string; prescriptions: Rx[]; isArchived: boolean; currentUserId: string; locale: string;
  medicalDocs?: { list: MedDoc[]; country: string; hasPatientId: boolean } | null;
}) {
  const t = useTranslations("patientDetail");
  const td = useTranslations("documents");
  const tpd = useTranslations("prescriptionDoc");
  const [docDialog, setDocDialog] = useState<DocDialogState | null>(null);
  const docGroups = groupCorrections(medicalDocs?.list ?? []);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  async function downloadDoc(doc: MedDoc) {
    setListError("");
    setPdfBusy(doc.id);
    try {
      const r = await makeDocumentPdf(patientId, doc, { footer: tpd("footer"), unsignedCopy: null });
      if (!r.ok) { setListError(r.code === "access_log_failed" ? t("filesAccessLogFailed") : td("pdfFailed")); return; }
      // The special control prescription is print-only (ad, as the app):
      // the print dialog opens on its two copies; the others download.
      if (doc.doc_type === "controlled_prescription") printPdf(r.bytes);
      else downloadPdf(r.bytes, `${td(`type.${doc.doc_type}`)} ${localDay(doc.created_at)}.pdf`);
    } catch {
      setListError(td("pdfFailed"));
    } finally {
      setPdfBusy(null);
    }
  }

  function deleteDoc(id: string) {
    if (!confirm(t("deleteRecordConfirm"))) return;
    setListError("");
    startTransition(async () => {
      const r = await deleteMedicalDocument(id, patientId);
      if (!r.ok) setListError(errorText(r.code));
    });
  }

  function renderDoc(doc: MedDoc, depth: number): React.ReactNode {
    const corrections = docGroups.correctionsOf.get(doc.id) ?? [];
    const corrected = corrections.length > 0;
    const f = doc.fields as Record<string, unknown>;
    const preview = doc.doc_type === "exam_request"
      ? ((f.exams as string[] | undefined) ?? []).filter((x) => x.trim()).join(" · ")
      : doc.doc_type === "controlled_prescription"
        ? ((f.items as { name: string }[] | undefined) ?? []).map((x) => x.name).filter(Boolean).join(" · ")
        : doc.body ?? "";
    return (
      <div key={doc.id} data-testid="medical-doc" className={depth === 0 ? "rounded-2xl border border-slate-100 bg-white p-5" : "mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4"}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {depth > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("correctionLabel")}</span>}
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{td(`type.${doc.doc_type}`)}</span>
            <span className="text-xs font-semibold text-slate-500">{formatShortDate(locale, localDay(doc.created_at))}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" disabled={pdfBusy === doc.id} onClick={() => void downloadDoc(doc)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60">{doc.doc_type === "controlled_prescription" ? td("print") : td("download")}</button>
            <EntryActions
              editable={canEditEntry(doc, currentUserId) && !corrected}
              isArchived={isArchived}
              pending={pending}
              onEdit={() => setDocDialog({ mode: "edit", doc })}
              onDelete={() => deleteDoc(doc.id)}
              onCorrect={() => setDocDialog({ mode: "correct", doc })}
            />
          </div>
        </div>
        {preview && <p className={`line-clamp-3 whitespace-pre-wrap text-sm ${corrected ? "text-slate-400 line-through" : "text-slate-700"}`}>{preview}</p>}
        {corrections.map((c) => (
          <div key={c.id} className="mt-3">
            <CorrectionTrail correction={c} locale={locale} />
            {renderDoc(c, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  const practiceCalendar = usePracticeCalendar();
  const errorText = useClinicalErrorText();
  const [dialog, setDialog] = useState<RxDialog | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [medications, setMedications] = useState<MedRow[]>([medRow()]);
  const formRef = useRef<HTMLFormElement>(null);
  const { originals, correctionsOf } = groupCorrections(prescriptions);

  function open(d: RxDialog) {
    setError("");
    const items = d.mode === "new" ? [] : d.rx.prescription_items;
    setMedications(items.length > 0 ? items.map((m) => medRow(m)) : [medRow()]);
    setDialog(d);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result =
        dialog.mode === "new" ? await createPrescription(patientId, formData)
        : dialog.mode === "edit" ? await updatePrescription(dialog.rx.id, patientId, formData)
        : await addPrescriptionCorrection(dialog.rx.id, patientId, formData);
      if (result?.error) { setError(errorText(result.error)); return; }
      setDialog(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("deletePrescriptionConfirm"))) return;
    setListError("");
    startTransition(async () => {
      const result = await deletePrescription(id, patientId);
      if (result?.error) setListError(errorText(result.error));
    });
  }

  function renderRx(rx: Rx, depth: number): React.ReactNode {
    const corrections = correctionsOf.get(rx.id) ?? [];
    const corrected = corrections.length > 0;
    return (
      <div key={rx.id} className={depth === 0 ? "rounded-2xl border border-slate-100 bg-white p-5" : "mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4"}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {depth > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("correctionLabel")}</span>}
            <span className="text-xs font-semibold text-slate-500">{formatShortDate(locale, rx.date, practiceCalendar)}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* The print view (Help P6): "Imprimir / Salvar PDF" there. */}
            <a
              href={`${locale === "en" ? "" : `/${locale}`}/dashboard/patients/${patientId}/prescriptions/${rx.id}/print`}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-teal-700 hover:bg-teal-50"
              aria-label={t("rxPdfAria")}
            >
              PDF
            </a>
            <EntryActions
              editable={canEditEntry(rx, currentUserId) && !corrected}
              isArchived={isArchived}
              pending={pending}
              onEdit={() => open({ mode: "edit", rx })}
              onDelete={() => handleDelete(rx.id)}
              onCorrect={() => open({ mode: "correct", rx })}
            />
          </div>
        </div>
        <div className={`space-y-2 ${corrected ? "opacity-60" : ""}`}>
          {rx.prescription_items.map((item, i) => (
            <div key={i} className="rounded-xl bg-slate-50 p-3">
              <p className={`font-semibold text-sm ${corrected ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.name}</p>
              <p className={`text-xs mt-0.5 ${corrected ? "text-slate-400 line-through" : "text-slate-500"}`}>{[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}</p>
            </div>
          ))}
        </div>
        {rx.notes && <p className={`mt-3 text-xs italic ${corrected ? "text-slate-400 line-through" : "text-slate-500"}`}>{rx.notes}</p>}
        {corrections.map((c) => (
          <div key={c.id} className="mt-3">
            <CorrectionTrail correction={c} locale={locale} />
            {renderRx(c, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  const initial = dialog && dialog.mode !== "new" ? dialog.rx : null;
  const title = !dialog ? "" : dialog.mode === "new" ? t("newPrescription") : dialog.mode === "edit" ? t("editPrescriptionTitle") : t("correctPrescriptionTitle");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{t("prescriptions", { n: originals.length })}</p>
        {!isArchived && (medicalDocs ? (
          <div className="flex gap-2">
            <button onClick={() => open({ mode: "new" })} className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 transition">{td("addPrescription")}</button>
            <button onClick={() => setDocDialog({ mode: "new", type: null })} className="rounded-xl border border-teal-600 px-3 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 transition">{td("addDocument")}</button>
          </div>
        ) : <button onClick={() => open({ mode: "new" })} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t("newPrescription")}
        </button>)}
      </div>
      {listError && <p className="mb-3 text-sm text-red-600">{listError}</p>}

      {originals.length + docGroups.originals.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-400">{t("noPrescriptions")}</p>
        </div>
      ) : (
        // One list, newest first (cf): prescriptions and documents together.
        <div className="space-y-3">
          {[
            ...originals.map((rx) => ({ at: rx.created_at, node: () => renderRx(rx, 0) })),
            ...docGroups.originals.map((d) => ({ at: d.created_at, node: () => renderDoc(d, 0) })),
          ].sort((a, b) => b.at.localeCompare(a.at)).map((x) => x.node())}
        </div>
      )}

      {medicalDocs && (
        <Dialog open={!!docDialog} onClose={() => setDocDialog(null)} title={docDialog?.mode === "edit" ? t("editPrescriptionTitle") : docDialog?.mode === "correct" ? t("correctPrescriptionTitle") : td("newDocument")}>
          {docDialog && (
            <DocumentDialog
              key={docDialog.mode === "new" ? "new" : `${docDialog.mode}-${docDialog.doc.id}`}
              state={docDialog}
              patientId={patientId}
              patientName={patientName}
              country={medicalDocs.country}
              hasPatientId={medicalDocs.hasPatientId}
              onClose={() => setDocDialog(null)}
              reasonField={<ReasonField />}
            />
          )}
        </Dialog>
      )}

      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={title}>
        <form key={dialog ? `${dialog.mode}-${initial?.id ?? "new"}` : "closed"} ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <FieldLabel>{t("medications")}</FieldLabel>
              <button type="button" onClick={() => setMedications((m) => [...m, medRow()])} className="text-xs font-semibold text-teal-600 hover:text-teal-700">{t("addMedication")}</button>
            </div>
            <div className="space-y-3">
              {medications.map((med, i) => (
                <div key={med.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{t("medicationN", { n: i + 1 })}</span>
                    {medications.length > 1 && (
                      <button type="button" onClick={() => setMedications((m) => m.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:text-red-600">{t("remove")}</button>
                    )}
                  </div>
                  <Input name={`name_${i}`} defaultValue={med.name} placeholder={t("medicationName")} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input name={`dosage_${i}`} defaultValue={med.dosage} placeholder={t("dosage")} />
                    <Input name={`frequency_${i}`} defaultValue={med.frequency} placeholder={t("frequency")} />
                    <Input name={`duration_${i}`} defaultValue={med.duration} placeholder={t("duration")} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>{t("notesOptional")}</FieldLabel>
            <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder={t("notesPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>
          {dialog?.mode === "correct" && <ReasonField />}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDialog(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : dialog?.mode === "correct" ? t("addCorrection") : t("savePrescription")}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function AppointmentsTab({ appointments, locale }: { appointments: Appt[]; locale: string }) {
  const t = useTranslations("patientDetail");
  const tPay = useTranslations("payments");

  function statusBadgeClass(status: string) {
    switch (status) {
      case "confirmed": return "bg-teal-100 text-teal-700";
      case "scheduled": return "bg-amber-100 text-amber-700";
      case "completed": return "bg-green-100 text-green-700";
      case "cancelled": return "bg-red-100 text-red-700";
      default: return "bg-slate-100 text-slate-500";
    }
  }

  return (
    <div>
      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-400">{t("noAppointments")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => (
            <div key={appt.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="shrink-0 rounded-lg bg-teal-50 p-2 text-center min-w-[44px]">
                <p className="text-xs font-bold text-teal-600 uppercase">{new Date(appt.date + "T12:00:00").toLocaleDateString(dateLocale(locale), { month: "short" })}</p>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{new Date(appt.date + "T12:00:00").getDate()}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm"><ConsultTypeLabel value={appt.consultation_type} /></p>
                <p className="text-xs text-slate-500">{appt.start_time?.slice(0, 5)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                {appt.payment_status !== "paid" && !hasAmount(appt.payment_amount) ? (
                  // No amount (the app's #216): not "Pendente".
                  <span className="text-xs font-semibold text-slate-500">{tPay("noAmount")}</span>
                ) : (
                  <span className={`text-xs font-semibold ${appt.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                    {appt.payment_status === "paid" ? t("paidLabel") : t("pendingLabel")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveDialog({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const t = useTranslations("patientDetail");
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Fetched when the dialog opens, so the count reflects bookings made
  // since the page loaded. The server still cancels whatever is upcoming at
  // archive time and notifies each patient.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setUpcoming(null);
    setLoadingPreview(true);
    getArchivePreview(patient.id).then((preview) => {
      if (cancelled) return;
      setUpcoming(preview?.upcomingAppointments ?? null);
      setLoadingPreview(false);
    });
    return () => { cancelled = true; };
  }, [open, patient.id]);

  function handleArchive() {
    setError("");
    startTransition(async () => {
      const result = await archivePatient(patient.id);
      if ("error" in result && result.error !== "already_archived") {
        setError(t("archiveError"));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("archiveTitle", { name: patient.full_name })}>
      <p className="text-sm text-slate-600">{t("archiveBody")}</p>
      {loadingPreview ? (
        <p className="mt-3 text-sm text-slate-400">…</p>
      ) : upcoming !== null ? (
        // Always stated when known, zero included, so the user knows what
        // archiving will do; highlighted only when something is cancelled.
        <p className={`mt-3 rounded-xl border px-4 py-3 text-sm font-semibold ${upcoming > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {t("archiveUpcoming", { n: upcoming })}
        </p>
      ) : null}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-5">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
        <button type="button" onClick={handleArchive} disabled={pending || loadingPreview} className="flex-1 rounded-xl bg-[#1e293b] py-2.5 text-sm font-bold text-[#ffffff] hover:bg-[#0f172a] transition disabled:opacity-60">
          {pending ? t("saving") : t("archiveConfirm")}
        </button>
      </div>
    </Dialog>
  );
}

export function ArchivedBanner({ patientId, archivedAt, archivedByName, archivedReason = null, locale }: {
  patientId: string; archivedAt: string; archivedByName: string | null; archivedReason?: string | null; locale: string;
}) {
  const t = useTranslations("patientDetail");
  const tPatients = useTranslations("patients");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleRestore() {
    setError("");
    startTransition(async () => {
      const result = await restorePatient(patientId);
      if ("error" in result) { setError(tPatients("restoreError")); return; }
      router.refresh();
    });
  }

  return (
    <div role="status" className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3.5">
      <div>
        <p className="text-sm font-bold text-slate-800">{archivedLabel(tPatients, archivedAt, archivedByName, locale, archivedReason)}</p>
        <p className="mt-0.5 text-xs text-slate-600">{t("archivedSub")}</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <button type="button" onClick={handleRestore} disabled={pending} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
        {pending ? "…" : tPatients("restore")}
      </button>
    </div>
  );
}
