import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { ClinicsClient } from "./ClinicsClient";

export default async function ClinicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  // Managing clinic locations is doctor-only (the actions refuse anyone
  // else too). A secretary sees the clinic read-only in Settings.
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);

  const { data: clinics } = await supabase
    .from("clinics")
    .select("id, name, address, city, state, country, phone, lat, lng")
    .eq("professional_id", user.id)
    .order("created_at", { ascending: false });

  // The phone example follows the practice country, never the UI language.
  const phoneExample = countryProfile(await getPracticeCountry(supabase, user.id, user.id)).examples.phone;

  return <ClinicsClient clinics={clinics ?? []} phoneExample={phoneExample} />;
}
