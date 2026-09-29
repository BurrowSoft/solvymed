"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";
import { knownDbError } from "@/lib/dbErrors";
import { PICKER_LIMIT, cleanSearchText, patientSearchFilter } from "@/lib/patientSearch";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { MOVABLE_STATUSES, hoursWarning, keptDuration } from "@/lib/scheduleChecks";
import type { WorkingHours } from "@/lib/slots";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { tellPatient } from "@/lib/clinicNotify";

// The new-appointment patient picker: up to PICKER_LIMIT active patients of
// this practice whose name (or CPF/phone digits) match, searched in the
// database instead of loading every patient into the page.
export async function searchPatientsForPicker(q: string): Promise<{ id: string; full_name: string }[]> {
  if (!cleanSearchText(q)) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return [];
  // The practice country decides which ID column is searched.
  const filter = patientSearchFilter(q, patientIdKind(await getPracticeCountry(supabase, user.id, effectiveProfId)));
  if (!filter) return [];
  const { data } = await supabase
    .from("patients")
    .select("id, full_name")
    .eq("professional_id", effectiveProfId)
    .is("archived_at", null)
    .or(filter)
    .order("full_name")
    .limit(PICKER_LIMIT);
  return (data ?? []) as { id: string; full_name: string }[];
}

// Duration is already bounded to 480 (8h), but that alone doesn't stop a
// late start_time from producing an end time past midnight (e.g. 23:00 +
// 480min = "31:00", not a storable/valid time). Returns null when the
// slot would cross into the next day.
function computeEndTime(startTime: string, durationMinutes: number): string | null {
  const [h, m] = startTime.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const endTotal = h * 60 + m + durationMinutes;
  // >= not > — exactly 24:00 wraps to "00:00", which is earlier than the
  // same-day start_time and would break time ordering in slot/overlap math.
  if (endTotal >= 24 * 60) return null;
  return `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
}

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  let patientName = formData.get("patient_name") as string;
  // SolvyAI's cards book by id (two patients can share a name); the form
  // books by name.
  const patientIdIn = formData.get("patient_id");
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const consultationType = formData.get("consultation_type") as string;
  const type = (formData.get("type") as string) || "in-person";
  const paymentType = (formData.get("payment_type") as string) || "private";
  const notes = formData.get("notes") as string;

  if (typeof patientIdIn === "string" && patientIdIn) {
    const { data: byId } = await supabase
      .from("patients")
      .select("full_name")
      .eq("id", patientIdIn)
      .eq("professional_id", effectiveProfId)
      .maybeSingle();
    if (!byId) return { error: "Patient not found", code: "generic" };
    patientName = (byId as { full_name: string }).full_name;
  }
  if (!patientName || !date || !startTime) return { error: "Missing required fields", code: "missing_fields" };
  // Never saved or converted (the field blocks it first).
  if (looksBuddhistEra(date)) return { error: "Buddhist-era year", code: "date_buddhist_era" };

  const parsedDuration = parseInt(durationStr);
  const duration = Number.isInteger(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480 ? parsedDuration : 30;
  const endTime = computeEndTime(startTime, duration);
  if (!endTime) return { error: "This time and duration would run past midnight", code: "past_midnight" };

  // Find patient_id by name (best-effort match). Active patients win. When
  // the only match is archived, refuse rather than book an unlinked
  // appointment for someone the clinic archived; the server also refuses
  // appointments on an archived patient_id.
  const byName = supabase
    .from("patients")
    .select("id, archived_at")
    .eq("professional_id", effectiveProfId);
  const { data: patients } = await (typeof patientIdIn === "string" && patientIdIn
    ? byName.eq("id", patientIdIn).limit(1)
    : byName.ilike("full_name", patientName.trim()).order("archived_at", { ascending: false, nullsFirst: true }).limit(1));

  const match = patients?.[0] as { id: string; archived_at: string | null } | undefined;
  if (match?.archived_at) return { error: "Patient is archived", code: "patient_archived" };
  const patientId = match?.id ?? null;

  // Another appointment already there: a hard stop, like the app (the
  // database's exclusion constraint refuses it anyway; this says with whom).
  // The same statuses as the constraint (081): cancelled, rejected and
  // blocked time don't count.
  const { data: clashes } = await supabase
    .from("appointments")
    .select("patient_name, start_time, duration_minutes")
    .eq("professional_id", effectiveProfId)
    .eq("date", date)
    .not("status", "in", "(cancelled,rejected,blocked)")
    .lt("start_time", endTime)
    .gt("end_time", startTime)
    .order("start_time")
    .limit(1);
  const clash = clashes?.[0] as { patient_name: string | null; start_time: string; duration_minutes: number | null } | undefined;
  if (clash) {
    return {
      error: "This time overlaps with another appointment",
      code: "slot_overlap",
      overlap: { name: clash.patient_name ?? "", time: clash.start_time.slice(0, 5), durationMin: clash.duration_minutes ?? null },
    };
  }

  // Blocked time and times outside the working hours are allowed but asked
  // about first, in ONE question listing both (UX 2026-09-28); the form
  // resubmits with confirm_warnings=1. Never a hard refusal.
  if (formData.get("confirm_warnings") !== "1") {
    const [{ data: blocks }, { data: wh }] = await Promise.all([
      supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("professional_id", effectiveProfId)
        .eq("date", date)
        .eq("status", "blocked")
        .lt("start_time", endTime)
        .gt("end_time", startTime)
        .order("start_time")
        .limit(1),
      supabase.rpc("get_professional_working_hours", { p_professional_id: effectiveProfId }),
    ]);
    const block = blocks?.[0] as { start_time: string; end_time: string } | undefined;
    const hours = hoursWarning(date, startTime, endTime, wh as WorkingHours | null);
    if (block || hours) {
      // Stored clinic-local wall times, shown as HH:MM in the question.
      return {
        error: "Needs confirmation",
        code: "needs_confirm",
        blocked: block ? { start: block.start_time.slice(0, 5), end: block.end_time.slice(0, 5) } : null,
        hours,
      };
    }
  }

  // The value comes from the chosen procedure (its price, in the practice's
  // currency), as the form says; none when it has no price.
  let paymentAmount: number | null = null;
  if (consultationType) {
    const { data: proc } = await supabase
      .from("procedures")
      .select("price")
      .eq("professional_id", effectiveProfId)
      .eq("name", consultationType)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    const price = Number((proc as { price?: unknown } | null)?.price);
    if (Number.isFinite(price) && price > 0) paymentAmount = price;
  }

  const { data: saved, error } = await supabase.from("appointments").insert({
    professional_id: effectiveProfId,
    patient_id: patientId,
    patient_name: patientName.trim(),
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration,
    type,
    consultation_type: consultationType || "Consultation",
    payment_type: paymentType,
    payment_amount: paymentAmount,
    payment_status: "pending",
    status: "scheduled",
    notes: notes || null,
    scheduled_by: "professional",
  }).select("id").single();

  if (error) {
    if (error.message?.includes("patient_archived")) return { error: "Patient is archived", code: "patient_archived" };
    // Taken between the check above and the insert: the exclusion constraint.
    if (error.code === "23P01") return { error: "This time overlaps with another appointment", code: "slot_overlap", overlap: null };
    return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  }
  // The patient hears about it when they have the app (never the past).
  await tellPatient(supabase, {
    kind: "booked", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
    patientId, date, startTime,
  });
  revalidatePath("/dashboard/schedule");
  return { success: true, id: (saved as { id: string } | null)?.id };
}

// Remarcar: a new date and start, the same duration, with the same checks
// as booking (another appointment there is a hard stop saying with whom;
// blocked time / outside the working hours asked once, resubmitted with
// confirm_warnings=1). The patient with the app hears about it (08's text,
// old → new; never for the past).
export async function moveAppointment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const id = formData.get("id") as string;
  const date = formData.get("date") as string;
  const startTime = ((formData.get("start_time") as string) ?? "").slice(0, 5);
  if (!id || !date || !startTime) return { error: "Missing required fields", code: "missing_fields" };
  if (looksBuddhistEra(date)) return { error: "Buddhist-era year", code: "date_buddhist_era" };

  const { data: row } = await supabase
    .from("appointments")
    .select("status, date, start_time, end_time, duration_minutes, patient_id, patient_auth_id")
    .eq("id", id)
    .eq("professional_id", effectiveProfId)
    .maybeSingle();
  const before = row as { status: string; date: string; start_time: string; end_time: string; duration_minutes: number | null; patient_id: string | null; patient_auth_id: string | null } | null;
  if (!before) return { error: "Not found", code: "generic" };
  if (!MOVABLE_STATUSES.includes(before.status)) return { error: "Can't be moved", code: before.status === "tentative" || before.status === "proposal" ? "use_booking_card" : "not_movable" };
  // Nothing changes: nothing to ask, save or tell.
  if (before.date === date && before.start_time.slice(0, 5) === startTime) return { success: true, id };

  const duration = keptDuration(before.start_time, before.end_time);
  const endTime = computeEndTime(startTime, duration);
  if (!endTime) return { error: "This time and duration would run past midnight", code: "past_midnight" };

  // Another appointment there (not this one): a hard stop, saying with whom.
  const { data: clashes } = await supabase
    .from("appointments")
    .select("patient_name, start_time, duration_minutes")
    .eq("professional_id", effectiveProfId)
    .eq("date", date)
    .neq("id", id)
    .not("status", "in", "(cancelled,rejected,blocked)")
    .lt("start_time", endTime)
    .gt("end_time", startTime)
    .order("start_time")
    .limit(1);
  const clash = clashes?.[0] as { patient_name: string | null; start_time: string; duration_minutes: number | null } | undefined;
  if (clash) {
    return {
      error: "This time overlaps with another appointment",
      code: "slot_overlap",
      overlap: { name: clash.patient_name ?? "", time: clash.start_time.slice(0, 5), durationMin: clash.duration_minutes ?? null },
    };
  }

  if (formData.get("confirm_warnings") !== "1") {
    const [{ data: blocks }, { data: wh }] = await Promise.all([
      supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("professional_id", effectiveProfId)
        .eq("date", date)
        .eq("status", "blocked")
        .lt("start_time", endTime)
        .gt("end_time", startTime)
        .order("start_time")
        .limit(1),
      supabase.rpc("get_professional_working_hours", { p_professional_id: effectiveProfId }),
    ]);
    const block = blocks?.[0] as { start_time: string; end_time: string } | undefined;
    const hours = hoursWarning(date, startTime, endTime, wh as WorkingHours | null);
    if (block || hours) {
      return {
        error: "Needs confirmation",
        code: "needs_confirm",
        blocked: block ? { start: block.start_time.slice(0, 5), end: block.end_time.slice(0, 5) } : null,
        hours,
      };
    }
  }

  // The same statuses in the write itself, so a concurrent change (a cancel,
  // a request card) isn't overwritten.
  const { data: moved, error } = await supabase
    .from("appointments")
    .update({ date, start_time: startTime, end_time: endTime })
    .eq("id", id)
    .eq("professional_id", effectiveProfId)
    .in("status", MOVABLE_STATUSES)
    .select("id");
  if (error) {
    if (error.code === "23P01") return { error: "This time overlaps with another appointment", code: "slot_overlap", overlap: null };
    return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  }
  if (!moved?.length) return { error: "Can't be moved", code: "not_movable" };

  await tellPatient(supabase, {
    kind: "moved", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
    patientAuthId: before.patient_auth_id, patientId: before.patient_id, status: before.status,
    date, startTime, from: { date: before.date, startTime: before.start_time },
  });
  revalidatePath("/dashboard/schedule");
  return { success: true, id };
}

// tentative/proposal/rejected are deliberately excluded — those are
// workflow-only statuses owned by confirmBookingAndAddPatient,
// rejectBooking, and proposeNewTime (booking-actions.ts), which also
// handle confirm_and_link_patient / notifying the patient. This generic
// action must never be able to set OR move an appointment out of one of
// those states, or a booking request can be confirmed without linking the
// patient (reported by mob dev: mobile hit the identical bug through its
// own generic status control) or an ordinary appointment can be pushed
// into a fake booking-request state with no real request behind it.
const VALID_APPOINTMENT_STATUSES = [
  "scheduled", "confirmed", "completed", "cancelled", "blocked", "late", "absent",
];

export async function updateAppointmentStatus(id: string, status: string) {
  // Returns a stable code (not raw text) — the caller renders it through
  // next-intl.
  if (!VALID_APPOINTMENT_STATUSES.includes(status)) return { error: "Invalid status", code: "generic" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  // A cancel tells the patient (below): what it was before, read first.
  type Before = { status: string; date: string; start_time: string; patient_id: string | null; patient_auth_id: string | null };
  let before: Before | null = null;
  if (status === "cancelled") {
    const { data: row } = await supabase
      .from("appointments")
      .select("status, date, start_time, patient_id, patient_auth_id")
      .eq("id", id)
      .eq("professional_id", effectiveProfId)
      .maybeSingle();
    before = (row ?? null) as Before | null;
  }

  // The tentative/proposal exclusion is enforced in the same atomic write
  // as the update itself (not a separate read-then-write, which would be
  // a TOCTOU race against a concurrent booking-card action) — a 0-row
  // result means either no such appointment for this professional, or it
  // was in a workflow-only status.
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("professional_id", effectiveProfId)
    .not("status", "in", '("tentative","proposal")')
    .select("id");

  if (error) return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  if (!data || data.length === 0) {
    return { error: "Use the booking request card to confirm, reject, or propose a time for this request", code: "use_booking_card" };
  }

  // Cancelled now (not before): the patient hears about it when they have
  // the app; never for blocked time or the past.
  if (before && before.status !== "cancelled") {
    await tellPatient(supabase, {
      kind: "cancelled", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
      patientAuthId: before.patient_auth_id, patientId: before.patient_id, status: before.status,
      date: before.date, startTime: before.start_time,
    });
  }

  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function deleteAppointment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function blockTime(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const reason = formData.get("reason") as string;

  if (!date || !startTime) return { error: "Missing required fields", code: "missing_fields" };
  if (looksBuddhistEra(date)) return { error: "Buddhist-era year", code: "date_buddhist_era" };

  const parsedDuration = parseInt(durationStr);
  const duration = Number.isInteger(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480 ? parsedDuration : 60;
  const endTime = computeEndTime(startTime, duration);
  if (!endTime) return { error: "This time and duration would run past midnight", code: "past_midnight" };

  const { data: saved, error } = await supabase.from("appointments").insert({
    professional_id: effectiveProfId,
    patient_id: null,
    patient_name: reason || "Blocked",
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration,
    type: "in-person",
    consultation_type: reason || "Blocked",
    payment_type: "private",
    payment_status: "pending",
    status: "blocked",
    scheduled_by: "professional",
  }).select("id").single();

  if (error) return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  revalidatePath("/dashboard/schedule");
  return { success: true, id: (saved as { id: string } | null)?.id };
}
