"use server";

import { createClient } from "@/lib/supabase/server";

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
  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_name")
    .eq("professional_id", professionalId)
    .eq("patient_auth_id", user.id)
    .eq("date", date)
    .eq("start_time", time)
    .eq("status", "tentative")
    .maybeSingle();
  if (!appt) return;

  const { data } = await supabase.rpc("get_clinic_push_tokens", { p_professional_id: professionalId });
  const tokens = (data ?? []).map((r: { token: string }) => r.token);
  if (!tokens.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((to: string) => ({
        to,
        title: "New Booking Request",
        body: `${appt.patient_name} requested an appointment on ${date} at ${time}.`,
        sound: "default",
      })),
    ),
  }).catch(() => {});
}
