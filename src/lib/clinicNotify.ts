import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush } from "./push";
import { patientPushTargets } from "./pushRecipient";
import { formatShortDate } from "./dateLabels";
import { pushText } from "./pushText";
import { clinicDate, clinicTime, getClinicTimeZone } from "./clinicTime";

// Telling a patient what the clinic did to their appointment from the
// website (UX 2026-09-29, 08's texts; the app does the same, mobile #111):
// booked or cancelled (the website can't move one). Only a patient with an
// app account hears it, in their language, the clinic named as patients see
// it; never for blocked time or anything already past. Best effort: nothing
// here ever fails the save.

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
  // A booked series: how many (the date/time above are the first).
  count?: number;
};

export async function tellPatient(db: SupabaseClient, change: ClinicChange): Promise<void> {
  try {
    if (change.status === "blocked") return;
    // Never for the past, by the clinic's clock.
    const tz = await getClinicTimeZone(db, { professionalId: change.practiceId, isSecretary: change.isSecretary === true });
    const now = new Date();
    const start = change.startTime.slice(0, 5);
    const today = clinicDate(now, tz);
    if (change.date < today || (change.date === today && start <= clinicTime(now, tz))) return;

    let account = change.patientAuthId ?? null;
    if (!account && change.patientId) {
      const { data } = await db.rpc("get_patient_auth_id", { p_patient_id: change.patientId });
      account = (data as string | null) ?? null;
    }
    if (!account) return;
    const targets = await patientPushTargets(db, account, change.practiceId);
    if (!targets.length) return;
    const clinic = await clinicName(db, change.practiceId);
    // Each device in its reader's language, the date in its format.
    for (const { locale, tokens } of targets) {
      const kind = change.kind === "booked" ? (change.count && change.count > 1 ? "apptBookedSeriesByClinic" : "apptBookedByClinic")
        : change.kind === "moved" ? "apptMovedByClinic" : "apptCancelledByClinic";
      const { title, body } = pushText(locale, kind, {
        clinic, date: formatShortDate(locale, change.date), time: start, n: change.count,
        ...(change.from ? { oldDate: formatShortDate(locale, change.from.date), oldTime: change.from.startTime.slice(0, 5) } : {}),
      });
      await sendExpoPush(tokens, title, body);
    }
  } catch {
    // Best effort.
  }
}
