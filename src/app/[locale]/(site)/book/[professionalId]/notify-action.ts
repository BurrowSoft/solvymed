"use server";

import { myAppointments } from "@/lib/myAppointments";
import { createClient } from "@/lib/supabase/server";
import { queueClinicNotice } from "@/lib/serverNotice";

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

  // The server tells the clinic (171): who, when, in each reader's language.
  await queueClinicNotice(supabase, "booking_requested", appt.id);
}
