import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { patientChannelEnabled, patientChannelPreviewTest } from "@/lib/patientChannel/live";
import { EMPTY_RULES } from "@/lib/patientChannel/rules";
import { PatientChannelSettings } from "./PatientChannelSettings";

// Patient Channel (specs/patient-contact-tech.md §6), M3a: the doctor's rules editor
// and "Test as a patient" (the prototype v17's tab 3). Doctors only; dark (404) while
// the patient_channel flag is off for the caller, except ?pc_test=1 on previews.
// Saving arrives with migration 237's PUT /api/patient-channel/config (M3b); until
// then the editor starts empty and nothing is stored.
export default async function PatientChannelSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pc_test?: string | string[] }>;
}) {
  const { locale } = await params;
  const { pc_test } = await searchParams;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if (!patientChannelPreviewTest(pc_test) && !(await patientChannelEnabled(supabase))) notFound();
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);
  const country = await getPracticeCountry(supabase, user.id, user.id);

  return (
    <PatientChannelSettings
      initialRules={{ ...EMPTY_RULES, country }}
      emergencyNumber={countryProfile(country).emergencyNumber}
    />
  );
}
