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
    />
  );
}
