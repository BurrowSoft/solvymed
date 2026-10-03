import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush } from "./push";
import { patientPushTargets } from "./pushRecipient";
import { formatShortDate } from "./dateLabels";
import { pushText } from "./pushText";
import { clinicDate, clinicTime, getClinicTimeZone } from "./clinicTime";
import { enqueuePatientNotice } from "./patientNotice";
import { doctorForPush } from "./pushDoctor";

// Telling a patient what the clinic did to their appointment from the
// website (UX 2026-09-29, 08's texts; the app does the same, mobile #111):
// booked or cancelled (the website can't move one). Only a patient with an
// app account hears it, in their language, the clinic named as patients see
// it; never for blocked time or anything already past. Best effort: nothing
// here ever fails the save.
//
// With migration 135 live, the notice goes through the outbox instead (sent
// ~60 s later, so a Desfazer can drop it): the server applies the same rules
// and texts. Until then, or if the outbox can't take it, it's sent here.

// The name patients see: the practice's profile name, else its first
// location's (by name), else the doctor's (the app's clinic-name.ts).
export function patientFacingClinicName(profileName: string | null | undefined, firstLocation: string | null | undefined, doctorName: string | null | undefined): string {
  return profileName?.trim() || firstLocation?.trim() || doctorName?.trim() || "SolvyMed";
}

async function clinicName(db: SupabaseClient, practiceId: string): Promise<string> {
  const [{ data: prof }, { data: locs }] = await Promise.all([
    db.from("professionals").select("clinic_name, full_name").eq("id", practiceId).maybeSingle(),
    db.from("clinics").select("name").eq("professional_id", practiceId).order("name").limit(1),
  ]);
  if (!prof) {
    // A secretary can't read the doctor's row: the practice's public info,
    // whose clinic_name is the patient-facing rule itself (profile → first
    // location by name, 110) and full_name the doctor's (7f; get_my_clinic
    // puts an arbitrary location first).
    const { data } = await db.rpc("get_professional_public_info", { p_professional_id: practiceId });
    const row = (Array.isArray(data) ? data[0] : data) as { clinic_name?: string | null; full_name?: string | null } | null;
    return patientFacingClinicName(row?.clinic_name, ((locs ?? []) as { name: string | null }[])[0]?.name, row?.full_name);
  }
  const p = prof as { clinic_name?: string | null; full_name?: string | null };
  return patientFacingClinicName(p.clinic_name, ((locs ?? []) as { name: string | null }[])[0]?.name, p.full_name);
}

export type ClinicChange = {
  kind: "booked" | "cancelled" | "moved";
  practiceId: string;
  // The caller is the practice's secretary (they read the clinic's zone differently).
  isSecretary?: boolean;
  // The appointment's linked app account when the row has one, else found
  // from its patient record.
  patientAuthId?: string | null;
  patientId?: string | null;
  status?: string | null;
  date: string;
  startTime: string;
  // A move: where it was (the date/time above are the new ones).
  from?: { date: string; startTime: string };
  // A booked series: all its dates (UX: only the FUTURE ones are announced,
  // one push naming the first future date and counting the future ones).
  dates?: string[];
  // The appointment(s) changed, for the outbox (a series: all its ids).
  appointmentIds?: string[];
};

// What the patient was told (the app's Told): a queued notice's id, null
// when nobody is to be told, or "direct" when a push went out from here (no
// undo can stop that one).
export type Told = number | null | "direct";

export async function tellPatient(db: SupabaseClient, change: ClinicChange): Promise<Told> {
  if (change.appointmentIds?.length) {
    try {
      return await enqueuePatientNotice(db, change.kind, change.appointmentIds, change.kind === "moved" ? change.from : undefined);
    } catch {
      // Not live (or unreachable): send directly.
    }
  }
  return (await tellPatientDirectly(db, change)) ? "direct" : null;
}

// true once a push was attempted (a failed send may still have gone out).
async function tellPatientDirectly(db: SupabaseClient, change: ClinicChange): Promise<boolean> {
  let sending = false;
  try {
    if (change.status === "blocked") return false;
    // Never for the past, by the clinic's clock.
    const tz = await getClinicTimeZone(db, { professionalId: change.practiceId, isSecretary: change.isSecretary === true });
    const now = new Date();
    const start = change.startTime.slice(0, 5);
    const today = clinicDate(now, tz);
    const nowTime = clinicTime(now, tz);
    const future = (change.dates ?? [change.date]).filter((d) => d > today || (d === today && start > nowTime)).sort();
    if (!future.length) return false;
    const date = future[0];
    const count = future.length;

    let account = change.patientAuthId ?? null;
    if (!account && change.patientId) {
      const { data } = await db.rpc("get_patient_auth_id", { p_patient_id: change.patientId });
      account = (data as string | null) ?? null;
    }
    if (!account) return false;
    const targets = await patientPushTargets(db, account, change.practiceId);
    if (!targets.length) return false;
    const clinic = await clinicName(db, change.practiceId);
    const doctor = await doctorForPush(db, change.practiceId);
    sending = true;
    // Each device in its reader's language, the date in its format.
    for (const { locale, tokens } of targets) {
      const kind = change.kind === "booked" ? (count > 1 ? "apptBookedSeriesByClinic" : "apptBookedByClinic")
        : change.kind === "moved" ? "apptMovedByClinic" : "apptCancelledByClinic";
      const { title, body } = pushText(locale, kind, {
        clinic, doctor, date: formatShortDate(locale, date), time: start, n: count,
        ...(change.from ? { oldDate: formatShortDate(locale, change.from.date), oldTime: change.from.startTime.slice(0, 5) } : {}),
      });
      await sendExpoPush(tokens, title, body);
    }
    return true;
  } catch {
    // Best effort.
    return sending;
  }
}
