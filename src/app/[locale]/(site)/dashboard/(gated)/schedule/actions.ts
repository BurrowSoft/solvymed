"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProfId } from "@/lib/activeAccess";
import { knownDbError } from "@/lib/dbErrors";
import { PICKER_LIMIT, cleanSearchText, patientSearchFilter } from "@/lib/patientSearch";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { MOVABLE_STATUSES, hoursWarning, keptDuration } from "@/lib/scheduleChecks";
import { getDayHours, type WorkingHours } from "@/lib/slots";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { MAX_OCCURRENCES, MIN_OCCURRENCES, RECURRENCES, recurrenceDates, type Recurrence } from "@/lib/recurrence";
import { tellPatient, type Told } from "@/lib/clinicNotify";
import { cancelPatientNotice, enqueuePatientNotice } from "@/lib/patientNotice";
import type { UndoToken } from "@/lib/scheduleUndo";
import { signUndo, verifyUndo } from "@/lib/scheduleUndoSign";
import { cleanReason, statusReasonLive } from "@/lib/statusReason";

// The new-appointment patient picker: up to PICKER_LIMIT active patients of
// this practice whose name (or CPF/phone digits) match, searched in the
// database instead of loading every patient into the page.
export async function searchPatientsForPicker(q: string): Promise<{ id: string; full_name: string }[]> {
  if (!cleanSearchText(q)) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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
  // 1.8.0 F: a location the user picked (else the database fills the day's,
  // migration 200; it also refuses one that isn't this doctor's).
  const locationIn = formData.get("location_id");
  const locationId = typeof locationIn === "string" && /^[0-9a-f-]{36}$/i.test(locationIn) ? locationIn : null;

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

  // A recurring series (the app's): every week / 2 weeks / month, 2–52
  // dates, each checked below and saved in ONE insert (all or nothing).
  const recurrenceIn = formData.get("recurrence") as string | null;
  const recurrence = RECURRENCES.includes(recurrenceIn as Recurrence) ? (recurrenceIn as Recurrence) : null;
  let dates = [date];
  if (recurrence) {
    const n = parseInt((formData.get("occurrences") as string) ?? "", 10);
    if (!Number.isInteger(n) || n < MIN_OCCURRENCES || n > MAX_OCCURRENCES) return { error: "Invalid number of appointments", code: "invalid_occurrences" };
    dates = recurrenceDates(date, recurrence, n);
    // Dates to leave out of the series (SolvyAI's "Pular {data} e marcar as
    // outras"; the Agenda's form doesn't send it yet). Only real series
    // dates count; at least one date must remain.
    const skip = String(formData.get("skip_dates") ?? "").split(",").map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (skip.length) {
      dates = dates.filter((d) => !skip.includes(d));
      if (!dates.length) return { error: "Every date of the series was skipped", code: "invalid_occurrences" };
    }
  }
  // In a series, the messages name the date that has the problem.
  const onDate = (d: string) => (dates.length > 1 ? d : null);

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
    .select("date, patient_name, start_time, duration_minutes")
    .eq("professional_id", effectiveProfId)
    .in("date", dates)
    .not("status", "in", "(cancelled,rejected,blocked)")
    .lt("start_time", endTime)
    .gt("end_time", startTime)
    .order("date")
    .order("start_time")
    .limit(1);
  const clash = clashes?.[0] as { date: string; patient_name: string | null; start_time: string; duration_minutes: number | null } | undefined;
  if (clash) {
    return {
      error: "This time overlaps with another appointment",
      code: "slot_overlap",
      overlap: { name: clash.patient_name ?? "", time: clash.start_time.slice(0, 5), durationMin: clash.duration_minutes ?? null, date: onDate(clash.date) },
    };
  }

  // Blocked time and times outside the working hours are allowed but asked
  // about first, in ONE question listing both (UX 2026-09-28); the form
  // resubmits with confirm_warnings=1. Never a hard refusal.
  if (formData.get("confirm_warnings") !== "1") {
    const [{ data: blocks }, { data: wh }] = await Promise.all([
      supabase
        .from("appointments")
        .select("date, start_time, end_time")
        .eq("professional_id", effectiveProfId)
        .in("date", dates)
        .eq("status", "blocked")
        .lt("start_time", endTime)
        .gt("end_time", startTime)
        .order("date")
        .order("start_time")
        .limit(1),
      supabase.rpc("get_professional_working_hours", { p_professional_id: effectiveProfId }),
    ]);
    const block = blocks?.[0] as { date: string; start_time: string; end_time: string } | undefined;
    // The first date outside the hours (or a day off), if any.
    let hours: ReturnType<typeof hoursWarning> = null;
    let hoursDate: string | null = null;
    for (const d of dates) {
      hours = hoursWarning(d, startTime, endTime, wh as WorkingHours | null);
      if (hours) { hoursDate = d; break; }
    }
    if (block || hours) {
      // Stored clinic-local wall times, shown as HH:MM in the question; in a
      // series, the dates concerned.
      return {
        error: "Needs confirmation",
        code: "needs_confirm",
        blocked: block ? { start: block.start_time.slice(0, 5), end: block.end_time.slice(0, 5), date: onDate(block.date) } : null,
        hours,
        hoursDate: hoursDate ? onDate(hoursDate) : null,
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

  const rows = dates.map((d) => ({
    professional_id: effectiveProfId,
    patient_id: patientId,
    patient_name: patientName.trim(),
    date: d,
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
    ...(locationId ? { location_id: locationId } : {}),
  }));
  // One statement: if any date is taken meanwhile (23P01), none is saved.
  const { data: savedRows, error } = await supabase.from("appointments").insert(rows).select("id, date").order("date");
  const saved = ((savedRows ?? []) as { id: string; date: string }[])[0] ?? null;

  if (error) {
    if (error.message?.includes("patient_archived")) return { error: "Patient is archived", code: "patient_archived" };
    // Taken between the check above and the insert: the exclusion constraint.
    if (error.code === "23P01") return { error: "This time overlaps with another appointment", code: "slot_overlap", overlap: null };
    return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  }
  // The patient hears about it when they have the app (never the past).
  // A series is one push: how many, and the first.
  const ids = ((savedRows ?? []) as { id: string }[]).map((r) => r.id);
  const told = await tellPatient(supabase, {
    kind: "booked", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
    // The first date actually saved (a skipped first date isn't one).
    patientId, date: dates[0], startTime, ...(dates.length > 1 ? { dates } : {}),
    appointmentIds: ids,
  });
  revalidatePath("/dashboard/schedule");
  return { success: true, id: saved?.id, count: dates.length, undo: undoToken(told, effectiveProfId, { kind: "booked", ids, dates, start: startTime, status: "scheduled" }) };
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
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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
    // Migration 121's guard (completed / absent / cancelled / rejected never
    // change date): the same friendly line as the status check above.
    if (error.message?.includes("appointment_not_movable")) return { error: "Can't be moved", code: "not_movable" };
    return { error: error.message, code: knownDbError(error.message) ?? "generic" };
  }
  if (!moved?.length) return { error: "Can't be moved", code: "not_movable" };

  const told = await tellPatient(supabase, {
    kind: "moved", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
    patientAuthId: before.patient_auth_id, patientId: before.patient_id, status: before.status,
    date, startTime, from: { date: before.date, startTime: before.start_time },
    appointmentIds: [id],
  });
  revalidatePath("/dashboard/schedule");
  return {
    success: true, id,
    undo: undoToken(told, effectiveProfId, {
      kind: "moved", ids: [id], dates: [date], start: startTime, status: before.status,
      prevDate: before.date, prevStart: before.start_time.slice(0, 5), prevEnd: before.end_time.slice(0, 5),
    }),
  };
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

// reason: the clinic's optional reason on a cancel (150's status_reason,
// shown to the patient); ignored for other statuses and before 150.
export async function updateAppointmentStatus(id: string, status: string, reason?: string | null) {
  // Returns a stable code (not raw text) — the caller renders it through
  // next-intl.
  if (!VALID_APPOINTMENT_STATUSES.includes(status)) return { error: "Invalid status", code: "generic" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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
  const withReason = status === "cancelled" && statusReasonLive() ? { status_reason: cleanReason(reason) } : {};
  const { data, error } = await supabase
    .from("appointments")
    .update({ status, ...withReason })
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
  let undo: UndoToken | null = null;
  if (before && before.status !== "cancelled") {
    const told = await tellPatient(supabase, {
      kind: "cancelled", practiceId: effectiveProfId, isSecretary: user.id !== effectiveProfId,
      patientAuthId: before.patient_auth_id, patientId: before.patient_id, status: before.status,
      date: before.date, startTime: before.start_time,
      appointmentIds: [id],
    });
    // Blocked time isn't a cancel the patient hears of; its own flow.
    if (before.status !== "blocked") {
      undo = undoToken(told, effectiveProfId, { kind: "cancelled", ids: [id], dates: [before.date], start: before.start_time.slice(0, 5), status: "cancelled", prevStatus: before.status });
    }
  }

  revalidatePath("/dashboard/schedule");
  return { success: true, undo };
}

// The Agenda's Desfazer is offered unless a push already went out from
// here; the token is signed for this practice (never issued unsigned).
function undoToken(told: Told, practiceId: string, t: Omit<UndoToken, "told" | "iat" | "sig">): UndoToken | null {
  return told === "direct" ? null : signUndo({ ...t, told }, practiceId);
}

const UNDO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNDO_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const UNDO_ID = /^[0-9a-f-]{8,64}$/i;
const REVERTIBLE = ["scheduled", "confirmed", "late", "completed", "absent"];

// Desfazer (the app's undoAction order, so the patient is never told
// something that didn't stand, nor left untold of something that did):
//   1. every appointment is still as the action left it (else refused: it
//      changed again meanwhile, on another screen or device);
//   2. the queued notice is dropped (false: it's already on its way ->
//      refused; the action stands and the patient hears it);
//   3. revert. If that fails, the patient is told again (re-queued) and the
//      undo reports failure.
// The token comes back from the client: it must be untampered, this
// practice's and fresh (lib/scheduleUndoSign), and every field is still
// re-validated and every write scoped to the practice (RLS on top).
export async function undoScheduleChange(token: UndoToken): Promise<{ ok: boolean }> {
  const t = token as Partial<UndoToken> | null;
  const kind = t?.kind;
  const ids = Array.isArray(t?.ids) ? t!.ids.filter((x) => typeof x === "string" && UNDO_ID.test(x)) : [];
  const dates = Array.isArray(t?.dates) ? t!.dates.filter((d) => typeof d === "string" && UNDO_DATE.test(d)) : [];
  const start = typeof t?.start === "string" && UNDO_TIME.test(t.start) ? t.start.slice(0, 5) : null;
  const told = typeof t?.told === "number" && Number.isInteger(t.told) ? t.told : null;
  if ((kind !== "booked" && kind !== "moved" && kind !== "cancelled") || !ids.length || ids.length !== (t?.ids?.length ?? 0) || !dates.length || !start || typeof t?.status !== "string") return { ok: false };
  if (kind !== "booked" && ids.length !== 1) return { ok: false };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const prof = await getActiveProfId(supabase, user.id);
  if (!prof || !verifyUndo(token, prof)) return { ok: false };

  // 1. Still as the action left it.
  try {
    const { data, error } = await supabase.from("appointments").select("id, date, start_time, status").eq("professional_id", prof).in("id", ids);
    const rows = (data ?? []) as { id: string; date: string; start_time: string; status: string }[];
    if (error || rows.length !== ids.length) return { ok: false };
    if (!rows.every((r) => dates.includes(r.date) && r.start_time.slice(0, 5) === start && r.status === t!.status)) return { ok: false };
    // 2. The notice, dropped before anything changes.
    if (told !== null && !(await cancelPatientNotice(supabase, told))) return { ok: false };
  } catch {
    return { ok: false };
  }

  // 3. Revert (each write re-checks the state it expects).
  let reverted = false;
  try {
    if (kind === "booked") {
      // A booking (a whole series): gone.
      const { data, error } = await supabase.from("appointments").delete().eq("professional_id", prof).in("id", ids).eq("status", "scheduled").select("id");
      reverted = !error && (data ?? []).length === ids.length;
    } else if (kind === "moved") {
      const prevDate = t.prevDate, prevStart = t.prevStart, prevEnd = t.prevEnd;
      if (typeof prevDate === "string" && UNDO_DATE.test(prevDate) && typeof prevStart === "string" && UNDO_TIME.test(prevStart) && typeof prevEnd === "string" && UNDO_TIME.test(prevEnd)) {
        const { data, error } = await supabase.from("appointments")
          .update({ date: prevDate, start_time: prevStart.slice(0, 5), end_time: prevEnd.slice(0, 5) })
          .eq("id", ids[0]).eq("professional_id", prof).eq("date", dates[0]).in("status", MOVABLE_STATUSES)
          .select("id");
        reverted = !error && (data ?? []).length === 1;
      }
    } else {
      const prev = t.prevStatus;
      if (typeof prev === "string" && REVERTIBLE.includes(prev)) {
        const { data, error } = await supabase.from("appointments").update({ status: prev })
          .eq("id", ids[0]).eq("professional_id", prof).eq("status", "cancelled").select("id");
        reverted = !error && (data ?? []).length === 1;
      }
    }
  } catch {
    reverted = false;
  }
  if (!reverted) {
    // The action stands: the patient is told again (only if they were queued).
    if (told !== null) {
      await enqueuePatientNotice(supabase, kind, ids, kind === "moved" && t.prevDate && t.prevStart ? { date: t.prevDate, startTime: t.prevStart } : undefined).catch(() => null);
    }
    return { ok: false };
  }
  revalidatePath("/dashboard/schedule");
  return { ok: true };
}

export async function deleteAppointment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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
  const effectiveProfId = await getActiveProfId(supabase, user.id);
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

// The doctor's time picker (item 10): this date's working hours (whether
// the practice has any at all) and the times already taken (appointments
// and blocked time), so the grid can grey and mark them. Read-only.
// excludeId: the appointment being moved / answered, which never counts as
// taken against itself (as the app does; 9a).
export async function getScheduleDay(date: string, excludeId?: string): Promise<{
  hoursSet: boolean;
  day: { enabled: boolean; start: string; end: string } | null;
  taken: { start: string; end: string }[];
  openWeekdays: number[];
  country: string;
} | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return null;
  const [{ data: wh }, { data: rows }, country] = await Promise.all([
    supabase.rpc("get_professional_working_hours", { p_professional_id: effectiveProfId }),
    supabase.from("appointments").select("id, start_time, end_time, status").eq("professional_id", effectiveProfId).eq("date", date),
    getPracticeCountry(supabase, user.id, effectiveProfId),
  ]);
  const hours = (wh ?? {}) as WorkingHours;
  const hoursSet = Object.values(hours).some((d) => d?.enabled);
  const d = getDayHours(date, hours);
  const taken = ((rows ?? []) as { id: string; start_time: string; end_time: string; status: string }[])
    .filter((r) => r.id !== excludeId && !["cancelled", "rejected"].includes(r.status))
    .map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));
  // Weekdays (0 = Sunday) the practice opens: the calendar greys the rest.
  const openWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((w) => getDayHours(`2023-01-0${w + 1}`, hours)?.enabled);
  return { hoursSet, day: d ? { enabled: !!d.enabled, start: d.start.slice(0, 5), end: d.end.slice(0, 5) } : null, taken, openWeekdays, country };
}
