"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { createPatient, restorePatient, type PatientMatch } from "./actions";
import Link from "next/link";

type Patient = {
  id: string; full_name: string; email?: string; phone?: string;
  sex?: string; birth_date?: string; created_at: string;
  archived_at?: string | null; archived_by_name?: string | null;
};

// "Archived {date} by {name}". The name is stored at archive time, so it
// survives the secretary who archived leaving the clinic.
export function archivedLabel(
  t: ReturnType<typeof useTranslations>,
  archivedAt: string,
  byName: string | null | undefined,
  locale: string,
) {
  const date = new Date(archivedAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  return byName?.trim() ? t("archivedOnBy", { date, name: byName.trim() }) : t("archivedOn", { date });
}

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

function PatientForm({ onSubmit, pending, error, id }: { onSubmit: (fd: FormData) => void; pending: boolean; error: string; id?: string }) {
  const t = useTranslations("patients");
  const formRef = useRef<HTMLFormElement>(null);
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(new FormData(formRef.current!));
  }
  return (
    <form ref={formRef} id={id} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <FieldLabel>{t("fullName")} *</FieldLabel>
          <Input name="full_name" required placeholder="Patient's full name" />
        </div>
        <div>
          <FieldLabel>{t("email")}</FieldLabel>
          <Input name="email" type="email" placeholder="email@example.com" />
        </div>
        <div>
          <FieldLabel>{t("phone")}</FieldLabel>
          <Input name="phone" placeholder="+55 11 99999-9999" />
        </div>
        <div>
          <FieldLabel>{t("cpf")}</FieldLabel>
          <Input name="cpf" placeholder="000.000.000-00" />
        </div>
        <div>
          <FieldLabel>{t("dateOfBirth")}</FieldLabel>
          <Input name="birth_date" type="date" />
        </div>
        <div>
          <FieldLabel>{t("sex")}</FieldLabel>
          <Select name="sex">
            <option value="">{t("notSpecified")}</option>
            <option value="male">{t("male")}</option>
            <option value="female">{t("female")}</option>
            <option value="other">{t("other")}</option>
          </Select>
        </div>
        <div>
          <FieldLabel>{t("insuranceType")}</FieldLabel>
          <Select name="convenio_type">
            <option value="">{t("notSpecified")}</option>
            <option value="particular">{t("private")}</option>
            <option value="health_plan">{t("healthPlan")}</option>
          </Select>
        </div>
        <div className="col-span-2">
          <FieldLabel>{t("profession")}</FieldLabel>
          <Input name="profession" placeholder="e.g. Engineer, Teacher…" />
        </div>
        <div className="col-span-2">
          <FieldLabel>{t("emergencyPhone")}</FieldLabel>
          <Input name="emergency_phone" placeholder="+55 11 99999-9999" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
          {pending ? t("saving") : t("savePatient")}
        </button>
      </div>
    </form>
  );
}

export function PatientSearch({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("patients");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) params.set("q", e.target.value);
    else params.delete("q");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="search"
        placeholder={t("searchPlaceholder")}
        defaultValue={defaultValue}
        onChange={handleChange}
        className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      />
    </div>
  );
}

const NEW_PATIENT_FORM_ID = "new-patient-form";

// autoOpen: the setup checklist links here with ?new=1 (first patient).
export function NewPatientButton({ locale, autoOpen = false }: { locale: string; autoOpen?: boolean }) {
  const t = useTranslations("patients");
  const [open, setOpen] = useState(autoOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<PatientMatch[] | null>(null);
  const [existing, setExisting] = useState<{ id: string; full_name: string } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const router = useRouter();
  // Set by "Create anyway" for the very next submit only.
  const forceNext = useRef(false);
  const prefix = locale === "en" ? "" : `/${locale}`;

  function submit(formData: FormData) {
    setError("");
    setMatches(null);
    setExisting(null);
    if (forceNext.current) {
      formData.set("force", "1");
      forceNext.current = false;
    }
    startTransition(async () => {
      const result = await createPatient(formData);
      if ("success" in result) {
        setOpen(false);
        return;
      }
      if (result.code === "possible_match") { setMatches(result.matches); return; }
      if (result.code === "already_registered") {
        setExisting(result.existing);
        setError(result.existing ? t("alreadyRegistered", { name: result.existing.full_name }) : t("alreadyRegisteredGeneric"));
        return;
      }
      setError(t(result.code === "name_required" ? "nameRequired" : "saveError"));
    });
  }

  // Submits the form as it is NOW (the user may have edited it after seeing
  // the match), not a snapshot of the earlier attempt. requestSubmit also
  // re-runs the form's own validation.
  function createAnyway() {
    const form = document.getElementById(NEW_PATIENT_FORM_ID) as HTMLFormElement | null;
    if (!form) return;
    // An invalid form never reaches submit(), which would leave the force
    // flag set for the user's next ordinary save.
    if (!form.checkValidity()) { form.reportValidity(); return; }
    forceNext.current = true;
    form.requestSubmit();
  }

  function restoreMatch(id: string) {
    setError("");
    setRestoringId(id);
    startTransition(async () => {
      const result = await restorePatient(id);
      setRestoringId(null);
      if ("error" in result) { setError(t("restoreError")); return; }
      close();
      router.push(`${prefix}/dashboard/patients/${id}`);
    });
  }

  function close() {
    setOpen(false);
    setError("");
    setMatches(null);
    setExisting(null);
  }

  const matchPanel = matches && (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-semibold text-amber-900">{t("possibleMatchTitle")}</p>
      <ul className="mb-3 space-y-1.5">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 text-sm text-amber-900">
            <span>
              {m.full_name}
              {m.birth_date ? ` · ${t("bornOn", { date: new Date(m.birth_date + "T12:00:00").toLocaleDateString(locale) })}` : ""}
              {m.phone ? ` · ${m.phone}` : ""}
              {m.archived_at && (
                <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{t("archivedBadge")}</span>
              )}
            </span>
            {m.archived_at ? (
              // Bring the existing record back rather than creating a second
              // one for the same person.
              <button type="button" onClick={() => restoreMatch(m.id)} disabled={pending || restoringId !== null} className="shrink-0 font-semibold text-teal-700 hover:underline disabled:opacity-60">
                {restoringId === m.id ? "…" : t("restore")}
              </button>
            ) : (
              <Link href={`${prefix}/dashboard/patients/${m.id}`} className="shrink-0 font-semibold text-teal-700 hover:underline">
                {t("openExisting")}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={createAnyway} disabled={pending} className="text-sm font-semibold text-amber-900 underline disabled:opacity-60">
        {t("createAnyway")}
      </button>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {t("newPatient")}
      </button>
      <Dialog open={open} onClose={close} title={t("newPatient")}>
        {matchPanel}
        {existing && (
          <Link href={`${prefix}/dashboard/patients/${existing.id}`} className="mb-3 inline-block text-sm font-semibold text-teal-700 hover:underline">
            {t("openPatient")}
          </Link>
        )}
        <PatientForm id={NEW_PATIENT_FORM_ID} onSubmit={submit} pending={pending} error={error} />
      </Dialog>
    </>
  );
}

export function PatientCard({ patient, locale }: { patient: Patient; locale: string }) {
  const t = useTranslations("patients");
  const prefix = locale === "en" ? "" : `/${locale}`;
  const initials = patient.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <Link href={`${prefix}/dashboard/patients/${patient.id}`} className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-teal-200 hover:shadow-md transition-all">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 truncate">{patient.full_name}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {[patient.email, age ? `${age} ${t("yrs")}` : null, patient.phone].filter(Boolean).join(" · ")}
        </p>
        {patient.archived_at && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{archivedLabel(t, patient.archived_at, patient.archived_by_name, locale)}</p>
        )}
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-300 group-hover:text-teal-400 transition shrink-0">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </Link>
  );
}
