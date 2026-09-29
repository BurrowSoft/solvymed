import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush } from "./push";
import { patientPushLocale } from "./pushRecipient";
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
  kind: "booked" | "cancelled";
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
    const { data: tokenRows } = await db.rpc("get_patient_push_tokens", { p_patient_auth_id: account });
    const tokens = ((tokenRows ?? []) as { token: string }[]).map((r) => r.token);
    if (!tokens.length) return;

    const locale = await patientPushLocale(db, account, change.practiceId);
    const { title, body } = pushText(locale, change.kind === "booked" ? "apptBookedByClinic" : "apptCancelledByClinic", {
      clinic: await clinicName(db, change.practiceId),
      date: formatShortDate(locale, change.date),
      time: start,
    });
    await sendExpoPush(tokens, title, body);
  } catch {
    // Best effort.
  }
}
