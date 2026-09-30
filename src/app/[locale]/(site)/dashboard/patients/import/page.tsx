import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { conditionMet } from "@/lib/conditions";
import { ImportClient } from "./ImportClient";
import { mergeAvailable } from "../actions";

// Importar pacientes: the doctor only (130/131 refuse anyone else), and only
// once migrations 130 + 131 are on production (patient-import-live).
export default async function ImportPatientsPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!conditionMet("patient-import-live")) notFound();
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/patients`);
  // The template's ID columns follow the practice country.
  const country = await getPracticeCountry(supabase, user.id, user.id);
  return <ImportClient locale={locale} country={country} canMerge={await mergeAvailable()} />;
}
