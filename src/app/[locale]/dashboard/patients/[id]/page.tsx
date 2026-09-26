import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PatientTabs, ArchivedBanner, type MedRecord, type Rx } from "./PatientDetailClient";
import { getArchivePreview } from "../actions";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const prefix = locale === "en" ? "" : `/${locale}`;

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isSecretary = userRoleData?.role === "secretary";
  const effectiveProfId = isSecretary
    ? (userRoleData?.invited_by_professional_id as string | null) ?? user.id
    : user.id;

  // Records and prescriptions are doctor-only. RLS already denies them to
  // a secretary, but the page doesn't even ask, so clinical content can
  // never reach a secretary's browser through these props.
  const noRows = Promise.resolve({ data: [] as never[] });
  const [patientResult, recordsResult, prescriptionsResult, apptsResult, preview, t] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).eq("professional_id", effectiveProfId).single(),
    isSecretary
      ? noRows
      : supabase.from("medical_records").select("id, date, time, content, record_type, created_at, created_by, created_by_name, corrects_id, correction_reason").eq("patient_id", id).order("date", { ascending: false }).order("time", { ascending: false }),
    isSecretary
      ? noRows
      : supabase.from("prescriptions").select("id, date, notes, created_at, created_by, created_by_name, corrects_id, correction_reason, prescription_items(name, dosage, frequency, duration)").eq("patient_id", id).order("date", { ascending: false }),
    supabase.from("appointments").select("id, date, start_time, consultation_type, status, payment_status").eq("patient_id", id).neq("status", "blocked").order("date", { ascending: false }).limit(50),
    // Whether Delete is offered at all (only without clinical history).
    // Null on error: Delete stays hidden and Archive is always available.
    getArchivePreview(id),
    getTranslations("patientDetail"),
  ]);

  if (!patientResult.data) notFound();

  const patient = patientResult.data as {
    id: string; full_name: string; email?: string; phone?: string; cpf?: string;
    sex?: string; birth_date?: string; profession?: string; emergency_phone?: string;
    convenio_type?: string; invite_code?: string; created_at: string;
    booking_blocked?: boolean;
    archived_at?: string | null; archived_by_name?: string | null;
  };
  const isArchived = !!patient.archived_at;
  const records = (recordsResult.data ?? []) as MedRecord[];
  const prescriptions = (prescriptionsResult.data ?? []) as Rx[];
  const appointments = (apptsResult.data ?? []) as { id: string; date: string; start_time: string; consultation_type: string; status: string; payment_status: string }[];

  const initials = patient.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Back */}
      <Link href={`${prefix}/dashboard/patients`} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="15 18 9 12 15 6"/></svg>
        {t("allPatients")}
      </Link>

      {/* Patient header */}
      <div className="mb-8 flex items-center gap-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${patient.booking_blocked ? "bg-red-100 text-red-600" : "bg-teal-100 text-teal-700"}`}>
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900">{patient.full_name}</h1>
            {patient.booking_blocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t("blockedTitle")}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {[patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : null, age ? `${age} ${t("yrs")}` : null, patient.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {isArchived && (
        <ArchivedBanner
          patientId={patient.id}
          archivedAt={patient.archived_at!}
          archivedByName={patient.archived_by_name ?? null}
          locale={locale}
        />
      )}

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-6">
        <PatientTabs
          patient={patient}
          records={records}
          prescriptions={prescriptions}
          appointments={appointments}
          locale={locale}
          isSecretary={isSecretary}
          isArchived={isArchived}
          currentUserId={user.id}
          canDelete={preview?.hasClinicalHistory === false}
        />
      </div>
    </div>
  );
}
