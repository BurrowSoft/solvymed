"use server";

import { createClient } from "@/lib/supabase/server";

export async function notifyProfessionalOfBooking(
  professionalId: string,
  patientName: string,
  date: string,
  time: string,
) {
  const supabase = await createClient();
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
        body: `${patientName} requested an appointment on ${date} at ${time}.`,
        sound: "default",
      })),
    ),
  }).catch(() => {});
}
