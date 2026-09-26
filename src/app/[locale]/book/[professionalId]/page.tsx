import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { BookingClient } from "./BookingClient";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; professionalId: string }>;
  searchParams: Promise<{ name?: string; specialty?: string; clinicName?: string }>;
}) {
  const { locale, professionalId } = await params;
  const { name, specialty, clinicName } = await searchParams;

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
  const [{ data: profRaw }, t] = await Promise.all([
    supabase.rpc("get_professional_public_info", { p_professional_id: professionalId }).maybeSingle(),
    getTranslations({ locale, namespace: "book" }),
  ]);
  const prof = profRaw as { full_name: string | null; specialty: string | null; clinic_name: string | null } | null;
  const displayName = prof?.full_name?.trim() || name?.trim() || t("professionalFallback");
  const displaySpecialty = prof?.specialty?.trim() || specialty || "";
  const displayClinic = prof?.clinic_name?.trim() || clinicName || undefined;

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
    />
  );
}
