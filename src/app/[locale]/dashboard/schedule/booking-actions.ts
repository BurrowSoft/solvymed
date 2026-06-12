"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getTentativeBookings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("professional_id", user.id)
    .in("status", ["tentative", "proposal"])
    .order("date")
    .order("start_time");

  return data ?? [];
}

export async function confirmBooking(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ status: "confirmed" })
    .eq("id", appointmentId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };

  // Notify patient via push
  await notifyPatient(supabase, appointmentId, "Appointment Confirmed", "Your appointment has been confirmed by the doctor.");

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function rejectBooking(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ status: "rejected" })
    .eq("id", appointmentId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };

  await notifyPatient(supabase, appointmentId, "Booking Not Available", "The doctor could not accept your booking request.");

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function proposeNewTime(
  appointmentId: string,
  proposedDate: string,
  proposedStart: string,
  proposedEnd: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({
      status: "proposal",
      proposed_date: proposedDate,
      proposed_start_time: proposedStart,
      proposed_end_time: proposedEnd,
    })
    .eq("id", appointmentId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };

  await notifyPatient(supabase, appointmentId, "New Time Proposed", `The doctor proposed a new time: ${proposedDate} at ${proposedStart}.`);

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

// ─── Push helper ─────────────────────────────────────────────────────────────

async function notifyPatient(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  appointmentId: string,
  title: string,
  body: string,
) {
  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_auth_id")
    .eq("id", appointmentId)
    .maybeSingle();

  const patientAuthId = appt?.patient_auth_id as string | null;
  if (!patientAuthId) return;

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", patientAuthId);

  if (!tokens?.length) return;

  const messages = tokens.map((t: Record<string, unknown>) => ({
    to: t.token as string,
    title,
    body,
    sound: "default",
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  }).catch(() => {});
}
