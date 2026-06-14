"use server";

import { createClient } from "@/lib/supabase/server";

export async function notifyProfessionalOfBooking(
  professionalId: string,
  patientName: string,
  date: string,
  time: string,
) {
  const supabase = await createClient();
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", professionalId);
  if (!tokens?.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((row: { token: string }) => ({
        to: row.token,
        title: "New Booking Request",
        body: `${patientName} requested an appointment on ${date} at ${time}.`,
        sound: "default",
      })),
    ),
  }).catch(() => {});
}
