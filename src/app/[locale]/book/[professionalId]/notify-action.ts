"use server";

import { myAppointments } from "@/lib/myAppointments";
import { createClient } from "@/lib/supabase/server";
import { sendExpoPush } from "@/lib/push";

export async function notifyProfessionalOfBooking(
  professionalId: string,
  date: string,
  time: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Don't trust the caller's patientName/date/time as free text — this is a
  // Server Action, callable directly with any payload by anyone who has the
  // encoded action id (extractable from the client bundle), not just from
  // this booking flow's UI. Verify a real tentative booking exists for this
  // caller matching what's being announced before sending anything; RLS
  // limits this read to the caller's own appointments.
  const appt = (await myAppointments(supabase)).find((a) =>
    a.professional_id === professionalId && a.date === date && a.start_time.slice(0, 5) === time.slice(0, 5) && a.status === "tentative") ?? null;
  if (!appt) return;

  const { data } = await supabase.rpc("get_clinic_push_tokens", { p_professional_id: professionalId });
  const tokens = (data ?? []).map((r: { token: string }) => r.token);
  await sendExpoPush(tokens, "New Booking Request", `${appt.patient_name} requested an appointment on ${date} at ${time}.`);
}
