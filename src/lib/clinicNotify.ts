import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueuePatientNotice } from "./patientNotice";

// Telling a patient what the clinic did to their appointment from the
// website (UX 2026-09-29, 08's texts; the app does the same, mobile #111):
// booked or cancelled (the website can't move one). Only a patient with an
// app account hears it, in their language, the clinic named as patients see
// it; never for blocked time or anything already past. Best effort: nothing
// here ever fails the save.
//
// The notice goes through the outbox (135; sent ~60 s later, so a Desfazer
// can drop it): the server applies the rules and texts and sends it (171).

// The name patients see: the practice's profile name, else its first
// location's (by name), else the doctor's (the app's clinic-name.ts).
export function patientFacingClinicName(profileName: string | null | undefined, firstLocation: string | null | undefined, doctorName: string | null | undefined): string {
  return profileName?.trim() || firstLocation?.trim() || doctorName?.trim() || "SolvyMed";
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
  // Only through the server-sent outbox (135/171; the push service): the
  // website never reads anyone's push tokens. Not queued (not live, an
  // error): nobody is told, the change itself stands.
  if (!change.appointmentIds?.length) return null;
  try {
    return await enqueuePatientNotice(db, change.kind, change.appointmentIds, change.kind === "moved" ? change.from : undefined);
  } catch {
    return null;
  }
}
