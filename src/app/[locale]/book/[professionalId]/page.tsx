import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingClient } from "./BookingClient";

type WorkingDayHours = { enabled: boolean; start: string; end: string };
export type WorkingHours = Record<string, WorkingDayHours>;

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

  const { data: prof } = await supabase
    .from("professionals")
    .select("full_name, specialty, working_hours")
    .eq("id", professionalId)
    .maybeSingle();

  if (!prof) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    redirect(`${prefix}/discover`);
  }

  return (
    <BookingClient
      professionalId={professionalId}
      professionalName={name || (prof.full_name as string) || "Doctor"}
      specialty={specialty || (prof.specialty as string) || ""}
      clinicName={clinicName}
      workingHours={(prof.working_hours as WorkingHours) ?? {}}
      patientAuthId={user.id}
      patientEmail={user.email ?? ""}
      locale={locale}
    />
  );
}
