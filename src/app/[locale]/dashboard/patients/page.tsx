import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PatientSearch, NewPatientButton, PatientCard } from "./PatientsClient";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  let query = supabase
    .from("patients")
    .select("id, full_name, email, phone, sex, birth_date, created_at")
    .eq("professional_id", user.id)
    .order("full_name");

  if (q) query = query.ilike("full_name", `%${q}%`);

  const { data: patients, count } = await query;
  const totalCount = await supabase
    .from("patients")
    .select("*", { count: "exact", head: true })
    .eq("professional_id", user.id);

  const patientList = (patients ?? []) as {
    id: string; full_name: string; email?: string; phone?: string;
    sex?: string; birth_date?: string; created_at: string;
  }[];

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalCount.count ?? 0} total{q ? ` · ${patientList.length} matching "${q}"` : ""}
          </p>
        </div>
        <NewPatientButton locale={locale} />
      </div>

      {/* Search */}
      <div className="mb-5">
        <PatientSearch defaultValue={q ?? ""} />
      </div>

      {/* Patient list */}
      {patientList.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-slate-300">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="font-semibold text-slate-500">{q ? `No patients found for "${q}"` : "No patients yet"}</p>
          {!q && <p className="text-sm text-slate-400 mt-1">Tap "New Patient" to add your first one.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {patientList.map(patient => (
            <PatientCard key={patient.id} patient={patient} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
