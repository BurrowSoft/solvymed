"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeSlots, toMinutes } from "@/lib/slots";
import type { WorkingHours } from "@/lib/slots";
import { sendExpoPush } from "@/lib/push";

async function getEffectiveProfId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role === "secretary" && data?.invited_by_professional_id) {
    return data.invited_by_professional_id as string;
  }
  return userId;
}

// Finds the patients-table row this appointment's patient_auth_id maps to
// for effectiveProfId, creating one (and linking user_roles) if this is
// their first appointment with this professional. Shared by every action
// that can be the first professional-side touchpoint for a public booking
// (confirm, reject, propose) — they all need the same walk-in/existing/new
// resolution so the patient shows up in the patient list either way.
async function ensurePatientLinked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  effectiveProfId: string,
  patientAuthId: string,
  fallbackName: string,
): Promise<string | null> {
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("linked_patient_id")
    .eq("user_id", patientAuthId)
    .eq("invited_by_professional_id", effectiveProfId)
    .maybeSingle();

  const existingLinkedId = (existingRole?.linked_patient_id as string) ?? null;
  if (existingLinkedId) return existingLinkedId;

  const { data: profile } = await supabase
    .from("patient_profiles")
    .select("full_name, email, phone, birth_date, cpf")
    .eq("user_id", patientAuthId)
    .maybeSingle();

  const patientEmail = (profile?.email as string | null) ?? null;
  let linkedPatientId: string | null = null;

  // Check if this patient was manually added (walk-in) before they signed up
  if (patientEmail) {
    const { data: existingByEmail } = await supabase
      .from("patients")
      .select("id")
      .eq("professional_id", effectiveProfId)
      .eq("email", patientEmail)
      .maybeSingle();
    linkedPatientId = (existingByEmail?.id as string) ?? null;
  }

  if (!linkedPatientId) {
    const { data: newPatient } = await supabase
      .from("patients")
      .insert({
        full_name: (profile?.full_name as string | null) || fallbackName,
        professional_id: effectiveProfId,
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
        user_id: patientAuthId,
        role: "patient",
        linked_patient_id: linkedPatientId,
        invited_by_professional_id: effectiveProfId,
      },
      { onConflict: "user_id" },
    );
  }

  return linkedPatientId;
}

export async function getTentativeBookings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("professional_id", effectiveProfId)
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
      .eq("invited_by_professional_id", effectiveProfId)
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

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_name, patient_auth_id")
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    .maybeSingle();

  if (!appt) return { error: "Appointment not found" };

  const { error } = await supabase
    .from("appointments")
    .update({ status: "confirmed" })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };

  // Add to patient list only if not already linked to this professional
  if (appt.patient_auth_id) {
    const linkedPatientId = await ensurePatientLinked(
      supabase,
      effectiveProfId,
      appt.patient_auth_id as string,
      appt.patient_name as string,
    );

    // Populate patient_id so the patient can find this appointment via getPatientAppointments
    // (which queries by patient_id). Public bookings start with patient_id = null.
    if (linkedPatientId) {
      await supabase
        .from("appointments")
        .update({ patient_id: linkedPatientId })
        .eq("id", appointmentId)
        .is("patient_id", null);
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

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { error } = await supabase
    .from("appointments")
    .update({ status: "confirmed" })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

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

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_name, patient_auth_id")
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    .maybeSingle();

  const { error } = await supabase
    .from("appointments")
    .update({ status: "rejected" })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };

  // Add patient to patient list (same as confirm/propose)
  if (appt?.patient_auth_id) {
    await ensurePatientLinked(supabase, effectiveProfId, appt.patient_auth_id as string, appt.patient_name as string);
  }

  await notifyPatient(supabase, appointmentId, "Booking Not Available", note ? `The doctor could not accept your booking request. Note: ${note}` : "The doctor could not accept your booking request.");

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/patients");
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

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_name, patient_auth_id")
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    .maybeSingle();

  const { error } = await supabase
    .from("appointments")
    .update({
      status: "proposal",
      proposed_date: proposedDate,
      proposed_start_time: proposedStart,
      proposed_end_time: proposedEnd,
    })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };

  // Add patient to patient list (same as confirm)
  if (appt?.patient_auth_id) {
    await ensurePatientLinked(supabase, effectiveProfId, appt.patient_auth_id as string, appt.patient_name as string);
  }

  await notifyPatient(supabase, appointmentId, "New Time Proposed", note ? `The doctor proposed a new time: ${proposedDate} at ${proposedStart}. Note: ${note}` : `The doctor proposed a new time: ${proposedDate} at ${proposedStart}.`);

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/patients");
  return { error: null };
}

export async function acceptProposal(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: appt } = await supabase
    .from("appointments")
    .select("proposed_date, proposed_start_time, proposed_end_time, professional_id, patient_name")
    .eq("id", appointmentId)
    .eq("patient_auth_id", user.id)
    .maybeSingle();

  if (!appt) return { error: "Appointment not found" };

  const { error } = await supabase.rpc("accept_appointment_proposal", {
    p_appointment_id: appointmentId,
  });

  if (error) return { error: error.message };

  await notifyProfessional(supabase, appt.professional_id as string, "Proposal Accepted", `${appt.patient_name} accepted the new time: ${appt.proposed_date} at ${(appt.proposed_start_time as string).slice(0, 5)}.`);

  revalidatePath("/my-appointments");
  return { error: null };
}

export async function declineProposal(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: appt } = await supabase
    .from("appointments")
    .select("professional_id, patient_name")
    .eq("id", appointmentId)
    .eq("patient_auth_id", user.id)
    .maybeSingle();

  const { error } = await supabase.rpc("decline_appointment_proposal", {
    p_appointment_id: appointmentId,
  });

  if (error) return { error: error.message };

  if (appt) {
    await notifyProfessional(supabase, appt.professional_id as string, "Proposal Declined", `${appt.patient_name} declined the proposed time. The booking was cancelled.`);
  }

  revalidatePath("/my-appointments");
  return { error: null };
}

// SQL migrations for the RPCs called below (request_appointment_reschedule,
// accept_patient_reschedule) live in the mobile repo at
// solvymed-mobile/apps/solvymed/supabase/migrations/025_* and 026_*.
// Both repos share the same Supabase project.
export async function requestReschedule(
  appointmentId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: appt } = await supabase
    .from("appointments")
    .select("professional_id, patient_name")
    .eq("id", appointmentId)
    .eq("patient_auth_id", user.id)
    .maybeSingle();

  if (!appt) return { error: "Appointment not found" };

  // Use SECURITY DEFINER RPC — the patient UPDATE RLS policy only permits
  // rows already in tentative/proposal, so a direct update on a confirmed
  // appointment would be silently dropped.
  const { error } = await supabase.rpc("request_appointment_reschedule", {
    p_appointment_id: appointmentId,
    p_proposed_date: newDate,
    p_proposed_start: newStartTime,
    p_proposed_end: newEndTime,
  });

  if (error) {
    if (error.message?.includes("appointment_not_found_or_not_reschedulable")) {
      return { error: "Appointment cannot be rescheduled" };
    }
    return { error: error.message };
  }

  await notifyProfessional(
    supabase,
    appt.professional_id as string,
    "Reschedule Requested",
    `${appt.patient_name} requested to reschedule to ${newDate} at ${newStartTime.slice(0, 5)}.`,
  );

  revalidatePath("/my-appointments");
  return { error: null };
}

export async function acceptRescheduleRequest(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  // Atomic overlap check + update via SECURITY DEFINER RPC.
  // RPC returns notification fields so we never pre-fetch from the client
  // (pre-fetch is a spoofing surface: data can change between read and accept).
  // Pass p_acting_as_professional when the caller is a secretary so the RPC can
  // verify delegation and check the appointment against the correct professional.
  const { data: rpcData, error } = await supabase.rpc("accept_patient_reschedule", {
    p_appointment_id: appointmentId,
    ...(effectiveProfId !== user.id ? { p_acting_as_professional: effectiveProfId } : {}),
  });

  if (error) {
    if (error.message?.includes("slot_taken")) return { error: "slot_taken" };
    if (error.message?.includes("appointment_not_found_or_not_pending")) return { error: "Appointment not found" };
    if (error.message?.includes("proposed_time_expired")) return { error: "proposed_time_expired" };
    return { error: error.message };
  }

  const row = Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] as Record<string, unknown> : null;
  const newDate = row?.out_new_date as string | undefined;
  const newStart = row?.out_new_start_time as string | undefined;
  await notifyPatient(
    supabase,
    appointmentId,
    "Reschedule Confirmed",
    newDate && newStart
      ? `Your appointment has been rescheduled to ${newDate} at ${newStart.slice(0, 5)}.`
      : "Your reschedule request has been confirmed.",
  );

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function declineRescheduleRequest(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_auth_id")
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    .maybeSingle();

  if (!appt) return { error: "Appointment not found" };

  const { data: updateData, error } = await supabase
    .from("appointments")
    .update({
      status: "confirmed",
      scheduled_by: null,
      proposed_date: null,
      proposed_start_time: null,
      proposed_end_time: null,
    })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    .eq("status", "proposal")
    .eq("scheduled_by", "patient")
    .select("id");

  if (error) return { error: error.message };

  // Only notify when a row was actually updated (guard against concurrent declines)
  if (updateData && updateData.length > 0) {
    await notifyPatient(
      supabase,
      appointmentId,
      "Reschedule Request Declined",
      "The doctor could not accommodate your reschedule request. Your original appointment time remains confirmed — no action needed.",
    );
  }

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function getAvailableSlotsForDate(
  professionalId: string,
  date: string,
  durationMinutes: number,
) {
  if (!durationMinutes || durationMinutes <= 0 || !Number.isInteger(durationMinutes) || durationMinutes > 480) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profData } = await supabase.rpc("get_professional_working_hours", {
    p_professional_id: professionalId,
  });

  const wh = (profData ?? {}) as WorkingHours;

  const { data: busy } = await supabase.rpc("get_busy_slots", {
    p_professional_id: professionalId,
    p_date: date,
  });

  const busyRanges = (busy ?? []).map((r: Record<string, unknown>) => ({
    start: toMinutes(r.slot_start as string),
    end: toMinutes(r.slot_end as string),
  }));

  const slots = computeSlots(date, durationMinutes, wh, busyRanges);
  return slots;
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
  await sendExpoPush(tokens, title, body);
}

async function notifyProfessional(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  professionalId: string,
  title: string,
  body: string,
) {
  const { data } = await supabase.rpc("get_clinic_push_tokens", { p_professional_id: professionalId });
  const tokens = (data ?? []).map((r: { token: string }) => r.token);
  await sendExpoPush(tokens, title, body);
}
