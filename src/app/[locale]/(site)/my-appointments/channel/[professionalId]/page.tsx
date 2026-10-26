import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countryProfile } from "@/lib/country";
import { patientChannelEnabled, patientChannelPreviewTest } from "@/lib/patientChannel/live";
import { UUID, myRequestsWith, patientPage } from "@/lib/patientChannel/practice";
import { pcAdmin } from "@/lib/patientChannel/server";
import type { PcPatientPage } from "@/lib/patientChannel/patientPage";
import { SampleChannel } from "./SampleChannel";
import { RealChannel } from "./RealChannel";
import { UnavailableChannel } from "./UnavailableChannel";
import { ReadOnlyChannel } from "./ReadOnlyChannel";

// The patient's Patient Channel with one doctor (specs/patient-contact-tech.md §6; 01's
// route), from the doctor card's "Fale com o Médico". Dark: 404 unless the channel is on
// for the caller (the public flag or 237's testers). 237's pc_patient_page, run as the
// patient, is the access check: not connected, or the doctor's channel off → 404; the
// practice closed or the patient archived → "this channel isn't available" with the
// emergency notice (01). The doctor's channel off, or no longer connected, with requests
// there → read-only "Suas mensagens" (01, 10-26; the platform-wide switch is the emergency
// stop: still 404). ?pc_test=1 (never Production) keeps the M4a sample practice.
export default async function PatientChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; professionalId: string }>;
  searchParams: Promise<{ pc_test?: string | string[] }>;
}) {
  const { locale, professionalId } = await params;
  const { pc_test } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${locale === "en" ? "" : `/${locale}`}/auth/login`);
  if (patientChannelPreviewTest(pc_test)) return <SampleChannel />;
  if (!UUID.test(professionalId) || !(await patientChannelEnabled(supabase, user.id))) notFound();

  const access = await patientPage(supabase, professionalId);
  if (!access.ok && (access.code === "channel_off" || access.code === "not_connected")) {
    const requests = await myRequestsWith(supabase, professionalId);
    if (requests.length === 0) notFound();
    // The practice the patient wrote to: its name, country and zone, read with the service
    // role ONLY here, after the patient's own requests there are proven above (01, #636 ❌:
    // the public lookup answers nothing once they're disconnected, and it is not widened).
    const [{ data: info }, { data: prof }] = await Promise.all([
      supabase.rpc("get_professional_public_info", { p_professional_id: professionalId }).maybeSingle(),
      pcAdmin().from("professionals").select("country, full_name, time_zone").eq("id", professionalId).maybeSingle(),
    ]);
    const pub = info as { full_name?: string | null; specialty?: string | null; clinic_name?: string | null; time_zone?: string | null } | null;
    const own = prof as { country?: string | null; full_name?: string | null; time_zone?: string | null } | null;
    const country = own?.country ?? null;
    return (
      <ReadOnlyChannel
        doctorName={pub?.full_name?.trim() || own?.full_name?.trim() || ""}
        practiceLine={[pub?.clinic_name, pub?.specialty].filter(Boolean).join(" · ")}
        emergencyNumber={countryProfile(country).emergencyNumber}
        requests={requests}
        timeZone={pub?.time_zone || own?.time_zone || countryProfile(country).defaultTimeZone}
        country={country}
      />
    );
  }
  if (!access.ok) {
    if (access.code !== "pc_practice_closed" && access.code !== "pc_patient_archived") notFound();
    // The practice's country (the right emergency number) without the patient page.
    const { data } = await pcAdmin().from("professionals").select("country").eq("id", professionalId).maybeSingle();
    return <UnavailableChannel emergencyNumber={countryProfile((data as { country?: string | null } | null)?.country).emergencyNumber} />;
  }

  const p = access.page;
  const { data: info } = await supabase.rpc("get_professional_public_info", { p_professional_id: professionalId }).maybeSingle();
  const pub = info as { full_name?: string | null; specialty?: string | null; clinic_name?: string | null; time_zone?: string | null } | null;
  const page: PcPatientPage = {
    doctorName: p.brand?.displayName?.trim() || pub?.full_name?.trim() || "",
    practiceLine: [pub?.clinic_name, p.brand?.title?.trim() || pub?.specialty].filter(Boolean).join(" · "),
    emergencyNumber: countryProfile(p.country).emergencyNumber,
    slaBusinessDays: p.slaBusinessDays,
    welcome: p.welcome ?? "",
    reasons: p.reasons.map((r) => ({ ...r, subtitle: r.subtitle ?? "", options: Array.isArray(r.options) ? r.options : [] })),
    faq: p.faq,
    vocabulary: p.vocabulary,
    // The dates in "Suas mensagens" (P-14): the practice's zone and calendar.
    timeZone: pub?.time_zone || countryProfile(p.country).defaultTimeZone,
    country: p.country ?? null,
  };
  return <RealChannel page={page} profId={professionalId} />;
}
