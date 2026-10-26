import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { patientChannelPreviewTest } from "@/lib/patientChannel/live";
import { SampleChannel } from "./SampleChannel";

// The patient's Patient Channel with one doctor (specs/patient-contact-tech.md §6; 01's
// route, 10-22), from the doctor card's "Fale com o Médico". M4a: the flow's UI only. Until
// migration 237 (pc_patient_page, the connection check, /preview and the submit) it runs
// only as a preview test on sample data (?pc_test=1, never on Production); otherwise 404,
// whatever the flag says.
export default async function PatientChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; professionalId: string }>;
  searchParams: Promise<{ pc_test?: string | string[] }>;
}) {
  const { locale } = await params;
  const { pc_test } = await searchParams;
  if (!patientChannelPreviewTest(pc_test)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${locale === "en" ? "" : `/${locale}`}/auth/login`);
  return <SampleChannel />;
}
