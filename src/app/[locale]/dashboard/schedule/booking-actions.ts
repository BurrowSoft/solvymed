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

  const bookings = data ?? [];

  // Determine which patients are already linked to this doctor
  const authIds = bookings
    .map((b: Record<string, unknown>) => b.patient_auth_id as string)
    .filter(Boolean);

  let knownMap = new Map<string, string | null>();
  if (authIds.length > 0) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, linked_patient_id")
      .eq("invited_by_professional_id", user.id)
      .in("user_id", authIds);
    for (const r of roles ?? []) {
      knownMap.set(r.user_id as string, (r.linked_patient_id as string | null) ?? null);
    }
  }

  return bookings.map((b: Record<string, unknown>) => {
    const authId = b.patient_auth_id as string | null;
    const isNew = authId ? !knownMap.has(authId) : false;
    return {
      ...b,
      is_new_patient: isNew,
      patient_id: authId && !isNew ? (knownMap.get(authId) ?? null) : null,
    };
  });
}

export async function confirmBookingAndAddPatient(appointmentId: string, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_name, patient_auth_id")
    .eq("id", appointmentId)
    .eq("professional_id", user.id)
    .maybeSingle();

  if (!appt) return { error: "Appointment not found" };

  const { error } = await supabase
    .from("appointments")
    .update({ status: "confirmed" })
    .eq("id", appointmentId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };

  // Add to patient list only if not already linked to this professional
  if (appt.patient_auth_id) {
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("linked_patient_id")
      .eq("user_id", appt.patient_auth_id as string)
      .eq("invited_by_professional_id", user.id)
      .maybeSingle();

    if (!existingRole?.linked_patient_id) {
      const { data: profile } = await supabase
        .from("patient_profiles")
        .select("full_name, email, phone, birth_date, cpf")
        .eq("user_id", appt.patient_auth_id as string)
        .maybeSingle();

      const patientEmail = (profile?.email as string | null) ?? null;

      // Check if this patient was manually added (walk-in) before they signed up
      let linkedPatientId: string | null = null;
      if (patientEmail) {
        const { data: existingByEmail } = await supabase
          .from("patients")
          .select("id")
          .eq("professional_id", user.id)
          .eq("email", patientEmail)
          .maybeSingle();
        linkedPatientId = (existingByEmail?.id as string) ?? null;
      }

      if (!linkedPatientId) {
        const { data: newPatient } = await supabase
          .from("patients")
          .insert({
            full_name: (profile?.full_name as string | null) || (appt.patient_name as string),
            professional_id: user.id,
            email: patientEmail ?? undefined,
            phone: (profile?.phone as string | null) ?? undefined,
            birth_date: (profile?.birth_date as string | null) ?? undefined,
            cpf: (profile?.cpf as string | null) ?? undefined,
          })
          .select("id")
          .maybeSingle();
        linkedPatientId = (newPatient?.id as string) ?? null;
      }

      if (linkedPatientId) {
        await supabase.from("user_roles").upsert(
          {
            user_id: appt.patient_auth_id,
            role: "patient",
            linked_patient_id: linkedPatientId,
            invited_by_professional_id: user.id,
          },
          { onConflict: "user_id" },
        );
      }
    }
  }

  await notifyPatient(supabase, appointmentId, "Appointment Confirmed", note ? `Your appointment has been confirmed by the doctor. Note: ${note}` : "Your appointment has been confirmed by the doctor.");

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/patients");
  return { error: null };
}

export async function confirmBooking(appointmentId: string, note?: string) {
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
  await notifyPatient(supabase, appointmentId, "Appointment Confirmed", note ? `Your appointment has been confirmed by the doctor. Note: ${note}` : "Your appointment has been confirmed by the doctor.");

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function rejectBooking(appointmentId: string, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ status: "rejected" })
    .eq("id", appointmentId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };

  await notifyPatient(supabase, appointmentId, "Booking Not Available", note ? `The doctor could not accept your booking request. Note: ${note}` : "The doctor could not accept your booking request.");

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function proposeNewTime(
  appointmentId: string,
  proposedDate: string,
  proposedStart: string,
  proposedEnd: string,
  note?: string,
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

  await notifyPatient(supabase, appointmentId, "New Time Proposed", note ? `The doctor proposed a new time: ${proposedDate} at ${proposedStart}. Note: ${note}` : `The doctor proposed a new time: ${proposedDate} at ${proposedStart}.`);

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

  const { data } = await supabase.rpc("get_patient_push_tokens", { p_patient_auth_id: patientAuthId });
  const tokens = (data ?? []).map((r: { token: string }) => r.token);

  if (!tokens.length) return;

  const messages = tokens.map((to: string) => ({
    to,
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
