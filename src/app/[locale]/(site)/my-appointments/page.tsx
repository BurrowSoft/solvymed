import { myAppointments } from "@/lib/myAppointments";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyAppointmentsClient } from "./MyAppointmentsClient";
import { clinicDate } from "@/lib/clinicTime";
import { getOnboardingFlags } from "@/lib/setup";
import { SaveMyLocale } from "@/components/SaveMyLocale";
import { cookies } from "next/headers";
import { parseCountryChoice, patientLanguageTarget, SIGNUP_COUNTRY_COOKIE } from "@/lib/signupCountry";

export type PatientAppointment = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  consultation_type: string;
  type: string;
  professional_id: string;
  proposed_date: string | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  scheduled_by: string | null;
  // The patient's own booking message (never the clinic's notes).
  patient_note: string | null;
};

export default async function MyAppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id, linked_patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!userRoleData?.role && user.user_metadata?.role === "patient") {
    // Pending patient (invite code never resolved) — no linked doctor yet,
    // send to the retry form instead of rendering an empty appointments page.
    redirect(`${prefix}/auth/invite-required`);
  }
  if (userRoleData?.role === "patient" && userRoleData.invited_by_professional_id && !userRoleData.linked_patient_id) {
    // Linked to a doctor's "orbit" but not yet confirmed — no
    // patient_connections yet, so there's nothing to book or show here.
    redirect(`${prefix}/auth/pending-confirmation`);
  }
  if (userRoleData?.role && userRoleData.role !== "patient") {
    // Professional/secretary landed here directly — this page is patient-only.
    redirect(`${prefix}/dashboard`);
  }

  // Country first (149): the patient's country (their choice, else the
  // clinic's, else their language) sets the two languages they get. A page
  // in another one moves to the country's language. On any error nothing
  // happens (9a: never act on a failed lookup), and a language that isn't
  // public (Thai switched off) is never forced.
  // A signup pick not saved yet (its cookie) wins: SaveMyLocale below saves
  // it with this page's language, then clears it.
  const pick = parseCountryChoice((await cookies()).get(SIGNUP_COUNTRY_COOKIE)?.value);
  const { data: savedCountry, error: countryError } = pick ? { data: pick, error: null } : await supabase.rpc("my_country");
  const target = countryError ? null : patientLanguageTarget(locale, savedCountry as string | null);
  if (target) redirect(`${target === "en" ? "" : `/${target}`}/my-appointments`);

  let myProfessionalId = (userRoleData?.invited_by_professional_id as string | null) ?? null;
  if (!myProfessionalId && userRoleData?.linked_patient_id) {
    // Patients can't read the patients table directly via RLS, even their own
    // linked row — get_linked_professional_id() is a SECURITY DEFINER RPC that
    // bridges linked_patient_id -> patients.professional_id for the caller only.
    const { data: linkedProfId } = await supabase.rpc("get_linked_professional_id");
    myProfessionalId = (linkedProfId as string | null) ?? null;
  }

  // Patients can't read the professionals table directly via RLS
  // (book/[professionalId]/page.tsx documents the same limitation for
  // working hours) — get_professional_public_info() is the matching
  // SECURITY DEFINER RPC for display info.
  let myProfessionalMeta: { name: string; specialty: string; clinicName?: string } | null = null;
  if (myProfessionalId) {
    const { data: profRowRaw } = await supabase
      .rpc("get_professional_public_info", { p_professional_id: myProfessionalId })
      .maybeSingle();
    const profRow = profRowRaw as { full_name: string | null; specialty: string | null; clinic_name: string | null } | null;
    if (profRow) {
      myProfessionalMeta = {
        // No hard-coded English "Doctor": /book resolves the name itself and
        // has a translated fallback.
        name: (profRow.full_name as string | null)?.trim() ?? "",
        specialty: (profRow.specialty as string | null) ?? "",
        clinicName: (profRow.clinic_name as string | null) ?? undefined,
      };
    }
  }

  // Brazil's date, not the server's (UTC): the patient's appointments are
  // at a practice whose zone defaults to São Paulo. (A patient can't read
  // the practice's row, so its own zone isn't used here.)
  const today = clinicDate();

  // Only through get_my_appointments (migration 106): explicit columns,
  // never the clinic's notes. It comes ordered by date and start.
  const mine = await myAppointments(supabase);
  const upcoming = mine.filter((a) => a.date >= today && !["cancelled", "completed", "blocked", "rejected"].includes(a.status));
  const past = mine
    .filter((a) => a.date < today && ["completed", "confirmed", "scheduled"].includes(a.status))
    .reverse()
    .slice(0, 5);

  // The one-time "connected to {clinic}" card, once per clinic (migration 103).
  const flags = await getOnboardingFlags(supabase);
  const connectedClinicName = flags && !flags.patient_connected_seen && flags.clinic_professional_id ? flags.clinic_name : null;

  return (
    <>
    <SaveMyLocale locale={locale} />
    <MyAppointmentsClient
      connectedClinicName={connectedClinicName}
      upcoming={upcoming ?? []}
      past={past ?? []}
      userEmail={user.email ?? ""}
      myProfessionalId={myProfessionalId}
      myProfessionalMeta={myProfessionalMeta}
    />
    </>
  );
}
