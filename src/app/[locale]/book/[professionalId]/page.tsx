import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // Working hours are fetched client-side via get_professional_working_hours()
  // SECURITY DEFINER RPC — cannot read professionals table directly as a patient (RLS).
  return (
    <BookingClient
      professionalId={professionalId}
      professionalName={name ?? "Doctor"}
      specialty={specialty ?? ""}
      clinicName={clinicName}
      patientAuthId={user.id}
      patientEmail={user.email ?? ""}
      locale={locale}
      initialManualProfile={initialManualProfile}
    />
  );
}
