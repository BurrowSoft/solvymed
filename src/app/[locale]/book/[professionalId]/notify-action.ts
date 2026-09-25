"use server";

import { createClient } from "@/lib/supabase/server";
import { sendExpoPush } from "@/lib/push";

export async function notifyProfessionalOfBooking(
  professionalId: string,
  patientName: string,
  date: string,
  time: string,
) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_clinic_push_tokens", { p_professional_id: professionalId });
  const tokens = (data ?? []).map((r: { token: string }) => r.token);
  await sendExpoPush(tokens, "New Booking Request", `${patientName} requested an appointment on ${date} at ${time}.`);
}
