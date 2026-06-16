"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { createRecord, deleteRecord, createPrescription, deletePrescription, updatePatient, deletePatient, toggleBookingBlock } from "../actions";

type MedRecord = { id: string; date: string; time: string; content: string; record_type?: string; created_at: string };
type RxItem = { name: string; dosage: string; frequency: string; duration: string };
type Rx = { id: string; date: string; notes?: string; prescription_items: RxItem[] };
type Appt = { id: string; date: string; start_time: string; consultation_type: string; status: string; payment_status: string };
type Patient = {
  id: string; full_name: string; email?: string; phone?: string; cpf?: string;
  sex?: string; birth_date?: string; profession?: string; emergency_phone?: string;
  convenio_type?: string; invite_code?: string; created_at: string;
  booking_blocked?: boolean;
};

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

export function PatientTabs({ patient, records, prescriptions, appointments, locale, isSecretary = false }: {
  patient: Patient;
  records: MedRecord[];
  prescriptions: Rx[];
  appointments: Appt[];
  locale: string;
  isSecretary?: boolean;
}) {
  const t = useTranslations("patientDetail");
  const [tab, setTab] = useState<"info" | "records" | "prescriptions" | "appointments">("info");
  const ALL_TABS = [
    { key: "info" as const, label: t("tabInfo") },
    { key: "records" as const, label: t("tabRecords", { n: records.length }) },
    { key: "prescriptions" as const, label: t("tabPrescriptions", { n: prescriptions.length }) },
    { key: "appointments" as const, label: t("tabAppointments", { n: appointments.length }) },
  ];
  const TABS = ALL_TABS.filter(tb =>
    !isSecretary || !["records", "prescriptions"].includes(tb.key),
  );

  return (
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

      {tab === "info" && <PatientInfoTab patient={patient} locale={locale} />}
      {tab === "records" && <RecordsTab patientId={patient.id} records={records} />}
      {tab === "prescriptions" && <PrescriptionsTab patientId={patient.id} prescriptions={prescriptions} />}
      {tab === "appointments" && <AppointmentsTab appointments={appointments} locale={locale} />}
    </div>
  );
}

function PatientInfoTab({ patient, locale }: { patient: Patient; locale: string }) {
  const t = useTranslations("patientDetail");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [blockPending, startBlockTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;

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
      if (result?.error) { setError(result.error); return; }
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(t("deletePatientConfirm", { name: patient.full_name }))) return;
    startTransition(async () => {
      await deletePatient(patient.id);
      router.push(`${prefix}/dashboard/patients`);
    });
  }

  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const fields = [
    { label: t("email"), value: patient.email },
    { label: t("phone"), value: patient.phone },
    { label: t("cpf"), value: patient.cpf },
    { label: t("dateOfBirth"), value: patient.birth_date ? `${patient.birth_date}${age ? ` (${age} ${t("yrs")})` : ""}` : null },
    { label: t("sex"), value: patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : null },
    { label: t("profession"), value: patient.profession },
    { label: t("emergencyPhone"), value: patient.emergency_phone },
    { label: t("insurance"), value: patient.convenio_type === "health_plan" ? t("healthPlan") : patient.convenio_type === "particular" ? t("privateInsurance") : null },
    { label: t("patientSince"), value: new Date(patient.created_at).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) },
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
          <button
            onClick={handleToggleBlock}
            disabled={blockPending}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
              patient.booking_blocked
                ? "border-green-200 text-green-700 hover:bg-green-50"
                : "border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            {blockPending ? "…" : patient.booking_blocked ? t("unblockBookings") : t("blockBookings")}
          </button>
          <button onClick={handleDelete} disabled={pending} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
            {t("deletePatient")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
        <div>
          <FieldLabel>{t("cpf")}</FieldLabel>
          <Input name="cpf" defaultValue={patient.cpf ?? ""} />
        </div>
        <div>
          <FieldLabel>{t("dateOfBirth")}</FieldLabel>
          <Input name="birth_date" type="date" defaultValue={patient.birth_date ?? ""} />
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

function RecordsTab({ patientId, records }: { patientId: string; records: MedRecord[] }) {
  const t = useTranslations("patientDetail");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await createRecord(patientId, formData);
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      formRef.current?.reset();
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("deleteRecordConfirm"))) return;
    startTransition(async () => { await deleteRecord(id, patientId); });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{t("records", { n: records.length })}</p>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t("newRecord")}
        </button>
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-400">{t("noRecords")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="group rounded-2xl border border-slate-100 bg-white p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{r.date} {r.time}</span>
                  {r.record_type && r.record_type !== "free_text" && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 capitalize">{r.record_type.replace("_", " ")}</span>
                  )}
                </div>
                <button onClick={() => handleDelete(r.id)} className="hidden group-hover:flex items-center rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t("newRecord")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>{t("recordType")}</FieldLabel>
            <Select name="record_type">
              <option value="free_text">{t("freeText")}</option>
              <option value="soap">{t("soapNote")}</option>
              <option value="follow_up">{t("followUp")}</option>
              <option value="surgical">{t("surgical")}</option>
              <option value="referral">{t("referral")}</option>
            </Select>
          </div>
          <div>
            <FieldLabel>{t("content")} *</FieldLabel>
            <textarea name="content" required rows={6} placeholder={t("contentPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : t("saveRecord")}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function PrescriptionsTab({ patientId, prescriptions }: { patientId: string; prescriptions: Rx[] }) {
  const t = useTranslations("patientDetail");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [medications, setMedications] = useState([{ name: "", dosage: "", frequency: "", duration: "" }]);
  const formRef = useRef<HTMLFormElement>(null);

  function addMed() {
    setMedications(m => [...m, { name: "", dosage: "", frequency: "", duration: "" }]);
  }

  function removeMed(i: number) {
    setMedications(m => m.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await createPrescription(patientId, formData);
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      setMedications([{ name: "", dosage: "", frequency: "", duration: "" }]);
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("deletePrescriptionConfirm"))) return;
    startTransition(async () => { await deletePrescription(id, patientId); });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{t("prescriptions", { n: prescriptions.length })}</p>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t("newPrescription")}
        </button>
      </div>

      {prescriptions.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-400">{t("noPrescriptions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map(rx => (
            <div key={rx.id} className="group rounded-2xl border border-slate-100 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{rx.date}</span>
                <button onClick={() => handleDelete(rx.id)} className="hidden group-hover:flex items-center rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
              <div className="space-y-2">
                {rx.prescription_items.map((item, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 p-3">
                    <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
              </div>
              {rx.notes && <p className="mt-3 text-xs text-slate-500 italic">{rx.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t("newPrescription")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <FieldLabel>{t("medications")}</FieldLabel>
              <button type="button" onClick={addMed} className="text-xs font-semibold text-teal-600 hover:text-teal-700">{t("addMedication")}</button>
            </div>
            <div className="space-y-3">
              {medications.map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{t("medicationN", { n: i + 1 })}</span>
                    {medications.length > 1 && (
                      <button type="button" onClick={() => removeMed(i)} className="text-xs text-red-500 hover:text-red-600">{t("remove")}</button>
                    )}
                  </div>
                  <Input name={`name_${i}`} placeholder={t("medicationName")} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input name={`dosage_${i}`} placeholder={t("dosage")} />
                    <Input name={`frequency_${i}`} placeholder={t("frequency")} />
                    <Input name={`duration_${i}`} placeholder={t("duration")} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>{t("notesOptional")}</FieldLabel>
            <textarea name="notes" rows={2} placeholder={t("notesPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : t("savePrescription")}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function AppointmentsTab({ appointments, locale }: { appointments: Appt[]; locale: string }) {
  const t = useTranslations("patientDetail");

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
                <p className="text-xs font-bold text-teal-600 uppercase">{new Date(appt.date + "T12:00:00").toLocaleDateString(locale, { month: "short" })}</p>
                <p className="text-base font-extrabold text-slate-900 leading-tight">{new Date(appt.date + "T12:00:00").getDate()}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{appt.consultation_type}</p>
                <p className="text-xs text-slate-500">{appt.start_time?.slice(0, 5)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(appt.status)}`}>{appt.status}</span>
                <span className={`text-xs font-semibold ${appt.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                  {appt.payment_status === "paid" ? t("paidLabel") : t("pendingLabel")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
