"use server";

import { myAppointment } from "@/lib/myAppointments";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeSlots, toMinutes, getDayHours, filterPastSlots } from "@/lib/slots";
import type { WorkingHours } from "@/lib/slots";
import { sendExpoPush } from "@/lib/push";
import { pushText, pushWhen, type PushKind } from "@/lib/pushText";
import { formatShortDate } from "@/lib/dateLabels";
import { doctorForPush } from "@/lib/pushDoctor";
import { clinicPushTargets, patientPushTargets } from "@/lib/pushRecipient";
import { actionError } from "@/lib/dbErrors";
import { getActiveProfId, isLockedOut } from "@/lib/activeAccess";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { countryProfile } from "@/lib/country";
import { clinicDate, clinicTime } from "@/lib/clinicTime";
import { cleanReason, statusReasonLive } from "@/lib/statusReason";

export async function getTentativeBookings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return [];

  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("professional_id", effectiveProfId)
    .in("status", ["tentative", "proposal"])
    .order("date")
    .order("start_time");

  const bookings = data ?? [];

  // Determine which patients are already linked to this doctor. Direct
  // user_roles reads for other users' rows are RLS-blocked (own-row-only
  // policy), so this goes through a SECURITY DEFINER RPC instead — see
  // mob dev's migration (get_known_patients). Returns the linked
  // patients-table id when there is one, otherwise the id tied to an
  // earlier appointment with this professional.
  const authIds = bookings
    .map((b: Record<string, unknown>) => b.patient_auth_id as string)
    .filter(Boolean);

  const knownMap = new Map<string, string>();
  if (authIds.length > 0) {
    const { data: known } = await supabase.rpc("get_known_patients", {
      p_patient_auth_ids: authIds,
    });
    for (const row of (known ?? []) as Array<{ patient_auth_id: string; patient_id: string }>) {
      knownMap.set(row.patient_auth_id, row.patient_id);
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

// For tentative (patient-originated) booking requests only. Confirming and
// linking the patient record now happens server-side in one RPC call — see
// mob dev's migration 075 (_link_patient_account, shared with
// accept_appointment_proposal). Doctor-created appointments that don't need
// patient-linking go through the plain confirmBooking() below instead.
export async function confirmBookingAndAddPatient(appointmentId: string, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (await isLockedOut(supabase, user.id)) return { error: "Could not verify account" };

  const { error } = await supabase.rpc("confirm_and_link_patient", {
    p_appointment_id: appointmentId,
  });

  if (error) {
    if (error.message?.includes("appointment_not_confirmable")) {
      return { error: "This request can no longer be confirmed" };
    }
    return { error: actionError(error.message) };
  }

  // 150: the message is kept on the appointment for the patient; the push
  // only says there is one. Before 150, the note went in the push.
  const live = statusReasonLive();
  const message = live ? cleanReason(note) : null;
  // The push says there's a message only if it was really saved (9a).
  let saved = false;
  if (live) {
    const { error: messageError } = await supabase.from("appointments").update({ clinic_message: message }).eq("id", appointmentId);
    saved = !messageError && !!message;
  }
  await notifyPatient(supabase, appointmentId, "apptConfirmed", live ? { hasMessage: saved } : { note });

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/patients");
  return { error: null };
}

export async function confirmBooking(appointmentId: string, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };
  const live = statusReasonLive();
  const message = live ? cleanReason(note) : null;

  const { error } = await supabase
    .from("appointments")
    .update({ status: "confirmed", ...(live ? { clinic_message: message } : {}) })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: actionError(error.message) };

  // Notify patient via push (150: that there's a message, never its text)
  await notifyPatient(supabase, appointmentId, "apptConfirmed", live ? { hasMessage: !!message } : { note });

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

// note: the reason once 150 is live (status_reason, shown to the patient);
// before it, the push's note.
export async function rejectBooking(appointmentId: string, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };
  const live = statusReasonLive();

  const { error } = await supabase
    .from("appointments")
    .update({ status: "rejected", ...(live ? { status_reason: cleanReason(note) } : {}) })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: actionError(error.message) };

  // A rejected request never becomes an appointment — don't create a patient
  // record for it. Linking only happens on accept/confirm, server-side.
  // 150: the reason is on the patient's card, never in the push.
  await notifyPatient(supabase, appointmentId, "bookingNotAvailable", live ? {} : { note });

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

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };
  // A Buddhist-era year is never saved or converted (the field blocks it).
  if (looksBuddhistEra(proposedDate)) return { error: "date_buddhist_era" };
  const live = statusReasonLive();
  const message = live ? cleanReason(note) : null;

  const { data: updated, error } = await supabase
    .from("appointments")
    .update({
      status: "proposal",
      // The clinic's proposal, so neither platform counts it as a patient
      // request (the DB's and the app's rule: scheduled_by = 'patient' only for
      // the patient's own proposals; e7/38/9a, 1 Oct).
      scheduled_by: "professional",
      proposed_date: proposedDate,
      proposed_start_time: proposedStart,
      proposed_end_time: proposedEnd,
      ...(live ? { clinic_message: message } : {}),
    })
    .eq("id", appointmentId)
    .eq("professional_id", effectiveProfId)
    // Only a request (or a proposal being replaced) becomes a proposal, as
    // the app does: never a confirmed visit (38; 152 guards it too).
    .in("status", ["tentative", "proposal"])
    .select("id");

  if (error) return { error: actionError(error.message) };
  // Nothing changed (no longer a request): no notice to the patient.
  if (!updated?.length) return { error: "not_proposable" };

  // A proposal isn't a confirmed appointment yet — don't create a patient
  // record until the patient accepts (accept_appointment_proposal links via
  // the same shared _link_patient_account() as confirm_and_link_patient).
  await notifyPatient(supabase, appointmentId, "newTimeProposed", live ? { hasMessage: !!message, date: proposedDate, time: proposedStart } : { note, date: proposedDate, time: proposedStart });

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/patients");
  return { error: null };
}

export async function acceptProposal(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // The patient's own row, only through get_my_appointments (106).
  const appt = await myAppointment(supabase, appointmentId);

  if (!appt) return { error: "Appointment not found" };

  const { error } = await supabase.rpc("accept_appointment_proposal", {
    p_appointment_id: appointmentId,
  });

  // The proposed time has passed on the practice's clock (153, as 105).
  if (error?.message?.includes("proposed_time_expired")) return { error: "proposed_time_expired" };
  if (error) return { error: actionError(error.message) };

  await notifyProfessional(supabase, appt.professional_id as string, "proposalAccepted", { name: appt.patient_name as string, date: appt.proposed_date as string, time: appt.proposed_start_time as string });

  revalidatePath("/my-appointments");
  return { error: null };
}

export async function declineProposal(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const appt = await myAppointment(supabase, appointmentId);

  const { error } = await supabase.rpc("decline_appointment_proposal", {
    p_appointment_id: appointmentId,
  });

  if (error) return { error: actionError(error.message) };

  if (appt) {
    await notifyProfessional(supabase, appt.professional_id as string, "proposalDeclined", { name: appt.patient_name as string });
  }

  revalidatePath("/my-appointments");
  return { error: null };
}

// The patient cancels their own pending request (152: only a 'tentative'
// row they asked for). [] = not cancellable (the clinic already answered).
// The clinic gets "Pedido cancelado" (doctor + secretaries; never free text).
export async function cancelMyRequest(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const appt = await myAppointment(supabase, appointmentId);
  if (!appt) return { error: "not_cancellable" };

  const { data, error } = await supabase.rpc("cancel_my_booking", { p_appointment_id: appointmentId });
  const row = ((data ?? []) as { professional_id: string; patient_name: string | null }[])[0];
  if (error || !row) return { error: "not_cancellable" };

  await notifyProfessional(supabase, row.professional_id, "requestCancelled", {
    name: row.patient_name ?? (appt.patient_name as string),
    date: appt.date as string,
    time: appt.start_time as string,
  });

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
  if (looksBuddhistEra(newDate)) return { error: "date_buddhist_era" };

  const appt = await myAppointment(supabase, appointmentId);

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
    // The visit has started on the practice's clock (155).
    if (error.message?.includes("appointment_already_started")) return { error: "appointment_already_started" };
    if (error.message?.includes("appointment_not_found_or_not_reschedulable")) {
      return { error: "Appointment cannot be rescheduled" };
    }
    return { error: actionError(error.message) };
  }

  for (const { locale, tokens } of await clinicPushTargets(supabase, appt.professional_id as string)) {
    const { title, body } = pushText(locale, "rescheduleRequested", {
      name: (appt.patient_name as string) ?? "",
      oldDate: formatShortDate(locale, appt.date as string),
      oldTime: (appt.start_time as string).slice(0, 5),
      date: formatShortDate(locale, newDate),
      time: newStartTime.slice(0, 5),
    });
    await sendExpoPush(tokens, title, body);
  }

  revalidatePath("/my-appointments");
  return { error: null };
}

export async function acceptRescheduleRequest(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

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
    return { error: actionError(error.message) };
  }

  const row = Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] as Record<string, unknown> : null;
  const newDate = row?.out_new_date as string | undefined;
  const newStart = row?.out_new_start_time as string | undefined;
  await notifyPatient(
    supabase,
    appointmentId,
    newDate && newStart ? "rescheduleConfirmed" : "rescheduleConfirmedNoTime",
    { date: newDate ?? null, time: newStart ?? null },
  );

  revalidatePath("/dashboard/schedule");
  return { error: null };
}

export async function declineRescheduleRequest(appointmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

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

  if (error) return { error: actionError(error.message) };

  // Only notify when a row was actually updated (guard against concurrent declines)
  if (updateData && updateData.length > 0) {
    await notifyPatient(supabase, appointmentId, "rescheduleDeclined");
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

  // Short-circuit before the get_busy_slots round trip for a closed day —
  // computeSlots would return [] anyway, but only after paying for the RPC.
  if (!getDayHours(date, wh)?.enabled) return [];

  const { data: busy } = await supabase.rpc("get_busy_slots", {
    p_professional_id: professionalId,
    p_date: date,
  });

  const busyRanges = (busy ?? []).map((r: Record<string, unknown>) => ({
    start: toMinutes(r.slot_start as string),
    end: toMinutes(r.slot_end as string),
  }));

  const slots = computeSlots(date, durationMinutes, wh, busyRanges);
  // Today (item 22) on the clinic's clock: only the times still ahead; a
  // day already past offers none.
  const { data: info } = await supabase.rpc("get_professional_public_info", { p_professional_id: professionalId }).maybeSingle();
  const pub = info as { country?: string | null; time_zone?: string | null } | null;
  const tz = pub?.time_zone || countryProfile(pub?.country).defaultTimeZone;
  const now = new Date();
  const today = clinicDate(now, tz);
  if (date < today) return [];
  return filterPastSlots(slots, date, toMinutes(clinicTime(now, tz)), today);
}

// ─── Push helper ─────────────────────────────────────────────────────────────

// Every push is written in the recipient's language, dates in its format
// (lib/pushText, lib/pushRecipient).
async function notifyPatient(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  appointmentId: string,
  kind: PushKind,
  extra: { note?: string | null; hasMessage?: boolean; date?: string | null; time?: string | null } = {},
) {
  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_auth_id, professional_id, date, start_time")
    .eq("id", appointmentId)
    .maybeSingle();

  const patientAuthId = appt?.patient_auth_id as string | null;
  if (!patientAuthId) return;

  // "Always say who" (app #290): the doctor and the visit's date/time. The
  // caller's date/time when the push is about another one (a proposed or a
  // newly accepted time); else the appointment's own (where it stays).
  const doctor = await doctorForPush(supabase as never, appt?.professional_id as string);
  const date = (extra.date ?? (appt?.date as string | null)) || null;
  const time = ((extra.time ?? (appt?.start_time as string | null)) || "").slice(0, 5);
  for (const { locale, tokens } of await patientPushTargets(supabase, patientAuthId, appt?.professional_id as string)) {
    const when = extra.date ? pushWhen(locale, extra.date, extra.time) : undefined;
    const { title, body } = pushText(locale, kind, {
      when, note: extra.note, hasMessage: extra.hasMessage,
      doctor, date: date ? formatShortDate(locale, date) : "", time,
    });
    await sendExpoPush(tokens, title, body);
  }
}

async function notifyProfessional(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  professionalId: string,
  kind: PushKind,
  extra: { name?: string | null; date?: string | null; time?: string | null } = {},
) {
  for (const { locale, tokens } of await clinicPushTargets(supabase, professionalId)) {
    const when = extra.date ? pushWhen(locale, extra.date, extra.time) : undefined;
    const { title, body } = pushText(locale, kind, { name: extra.name ?? "", when });
    await sendExpoPush(tokens, title, body);
  }
}
