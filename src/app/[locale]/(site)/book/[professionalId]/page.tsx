import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { BookingClient } from "./BookingClient";
import { countryProfile } from "@/lib/country";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; professionalId: string }>;
  searchParams: Promise<{ name?: string | string[]; specialty?: string | string[]; clinicName?: string | string[] }>;
}) {
  const { locale, professionalId } = await params;
  // A repeated query param (?name=a&name=b) arrives as an array, so take
  // the first value rather than calling string methods on an array.
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const name = first(sp.name);
  const specialty = first(sp.specialty);
  const clinicName = first(sp.clinicName);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    redirect(`${prefix}/auth/login`);
  }

  // Check if the patient was manually added by this professional before signing up.
  // SECURITY DEFINER RPC — reads patients table bypassing patient RLS, but only
  // returns rows where patients.email matches the calling user's JWT email.
  const { data: manualData } = await supabase.rpc("get_manual_patient_profile", {
    p_professional_id: professionalId,
  });
  const initialManualProfile = (manualData as Array<{ full_name: string | null; phone: string | null; birth_date: string | null; cpf: string | null }> | null)?.[0] ?? null;

  // The header shows who the booking is with. Look it up server-side
  // (SECURITY DEFINER; a patient can't read professionals directly) rather
  // than relying on the ?name= link param, which is missing or empty on
  // some entry points. The param stays a fallback, and a translated neutral
  // label replaces the old hard-coded English "Doctor".
  const [{ data: profRaw }, t, accepts] = await Promise.all([
    supabase.rpc("get_professional_public_info", { p_professional_id: professionalId }).maybeSingle(),
    getTranslations({ locale, namespace: "book" }),
    // Migration 141: false while the practice's subscription is locked (or
    // the id is unknown). Only an explicit false stops the booking; an error
    // or a database without 141 (PGRST202) books as before (fail open; 142's
    // create_public_booking refusal is the real guard).
    supabase.rpc("get_practice_accepts_bookings", { p_professional_id: professionalId }),
  ]);
  // country: migration 110 (absent before it, which means BR).
  // time_zone: migration 128 (the clinic's own zone; the app uses it too).
  const prof = profRaw as { full_name: string | null; specialty: string | null; clinic_name: string | null; country?: string | null; time_zone?: string | null } | null;
  const displayName = prof?.full_name?.trim() || name?.trim() || t("professionalFallback");
  const displaySpecialty = prof?.specialty?.trim() || specialty || "";
  const displayClinic = prof?.clinic_name?.trim() || clinicName || undefined;

  // A locked practice: say so before the patient picks a time (UX), instead
  // of a calendar whose request the doctor couldn't see.
  if (!accepts.error && accepts.data === false) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-8 text-center">
          <p className="font-bold text-slate-900">{displayName}</p>
          {displayClinic && <p className="mt-0.5 text-xs text-slate-500">{displayClinic}</p>}
          <p role="status" className="mt-5 text-sm text-slate-700">{t("practiceInactive")}</p>
          <a href={`${prefix}/my-appointments`} className="mt-8 block w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition">
            {t("viewAppointments")}
          </a>
        </div>
      </div>
    );
  }

  // Working hours are fetched client-side via get_professional_working_hours()
  // SECURITY DEFINER RPC — cannot read professionals table directly as a patient (RLS).
  return (
    <BookingClient
      professionalId={professionalId}
      professionalName={displayName}
      specialty={displaySpecialty}
      clinicName={displayClinic}
      patientAuthId={user.id}
      patientEmail={user.email ?? ""}
      locale={locale}
      initialManualProfile={initialManualProfile}
      currency={countryProfile(prof?.country).currency}
      idKind={countryProfile(prof?.country).kind}
      clinicTz={prof?.time_zone || countryProfile(prof?.country).defaultTimeZone}
    />
  );
}
