import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId, myPractices } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { getClinicTimeZone } from "@/lib/clinicTime";
import { countryProfile } from "@/lib/country";
import { whenShortFormatter } from "@/lib/whenShort";
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
  // Rendered on the server only, so the server's text is the page's text. The same short form
  // as the access log (launch polish 32): the year only when it isn't this year.
  const formatWhen = whenShortFormatter(locale, countryProfile(country).calendar, zone);
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

// The sidebar's "Mensagens" badge (01, 10-26): the open requests the caller can act on, from
// 237's pc_inbox_counts: the doctor all open ones; a secretary the administrative ones.
// 0 on any failure (the badge just doesn't show).
export async function inboxOpenCount(supabase: Db, profId: string, isSecretary: boolean): Promise<number> {
  const { data, error } = await supabase.rpc("pc_inbox_counts", { p_prof: profId });
  if (error || !data || typeof data !== "object") return 0;
  const n = (data as Record<string, unknown>)[isSecretary ? "openForSecretary" : "open"];
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
