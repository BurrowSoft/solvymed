import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { EMPTY_RULES, fromStoredRules } from "@/lib/patientChannel/rules";
import { PatientChannelSettings } from "./PatientChannelSettings";

// Patient Channel (specs/patient-contact-tech.md §6): the doctor's rules editor and "Test
// as a patient". Doctors only; dark (404) unless the patient_channel flag is on or the
// doctor is on 237's testers allowlist. The rules load with their version; Save goes
// through PUT /api/patient-channel/config (validated, versioned, open requests rescored).
export default async function PatientChannelSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if (!(await patientChannelEnabled(supabase, user.id))) notFound();
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);
  const [country, saved] = await Promise.all([
    getPracticeCountry(supabase, user.id, user.id),
    supabase.rpc("pc_get_rules"),
  ]);
  // A failed read must not open an empty editor (Save would replace the stored rules).
  if (saved.error) {
    const [t, tSettings] = await Promise.all([getTranslations({ locale, namespace: "patientChannel" }), getTranslations({ locale, namespace: "settings" })]);
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <div className="error-banner mt-6">{tSettings("loadError")}</div>
      </div>
    );
  }
  const row = saved.data as { rules?: unknown; rulesVersion?: number } | null;
  const initialRules = row?.rules ? fromStoredRules(row.rules, country) : { ...EMPTY_RULES, country };

  return (
    <PatientChannelSettings
      initialRules={initialRules}
      initialVersion={row?.rulesVersion ?? 0}
      emergencyNumber={countryProfile(country).emergencyNumber}
    />
  );
}
