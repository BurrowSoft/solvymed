import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId, myPractices } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { getClinicTimeZone } from "@/lib/clinicTime";
import { countryProfile } from "@/lib/country";
import { dateLocale, plainSpaces } from "@/lib/dateLabels";
import { shortDoctorName, withBrandTitle } from "@/lib/doctorName";
import { patientChannelOnForPractice } from "./live";

// The inbox pages' shared start (M5): the signed-in doctor or secretary, the practice she
// acts for (the switcher's choice, as every dashboard page), the dark gate (inboxAvailable,
// below), and the practice's country, time zone and calendar for the dates. Staff keep the
// inbox after a switch-off while the practice has requests (01, 10-26: an emergency switch-off must not strand waiting
// patients; only the patient side closes). A secretary also gets her doctor's name for the
// "this message is for {doctor}" lines (01: no gendered "médico").
export async function staffContext(locale: string) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  const profId = await getEffectiveProfId(supabase, user.id);
  if (!profId) notFound();
  if (!(await inboxAvailable(supabase, user.id, profId))) notFound();
  const isSecretary = profId !== user.id;
  const [country, zone, practices] = await Promise.all([
    getPracticeCountry(supabase, user.id, profId),
    getClinicTimeZone(supabase, { professionalId: profId, isSecretary }),
    isSecretary ? myPractices(user.id) : Promise.resolve(null),
  ]);
  const practice = practices?.find((p) => p.professional_id === profId);
  const doctorName = practice ? withBrandTitle(practice.title, shortDoctorName(practice.display_name)) : "";
  const fmt = new Intl.DateTimeFormat(dateLocale(locale, countryProfile(country).calendar), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone,
  });
  // Rendered on the server only, so the server's text is the page's text.
  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : plainSpaces(fmt.format(d));
  };
  return { supabase, user, prefix, profId, isSecretary, country, doctorName, formatWhen };
}

// The inbox exists for this caller: the channel is on for them or the practice's doctor
// (the public switch or the testers' allowlist), or the practice already has requests the
// caller can read (RLS).
type Db = Awaited<ReturnType<typeof createClient>>;
export async function inboxAvailable(supabase: Db, userId: string, profId: string): Promise<boolean> {
  if (await patientChannelOnForPractice(supabase, userId, profId)) return true;
  const { data, error } = await supabase.from("pc_requests").select("id").eq("professional_id", profId).limit(1);
  return !error && (data?.length ?? 0) > 0;
}
