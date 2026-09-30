"use server";

import { createAppointment, blockTime, moveAppointment, updateAppointmentStatus, deleteAppointment } from "./(gated)/schedule/actions";
import { MOVABLE_STATUSES } from "@/lib/scheduleChecks";
import { confirmBookingAndAddPatient, rejectBooking } from "./(gated)/schedule/booking-actions";
import { createPatient, deletePatient } from "./(gated)/patients/actions";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { markPaid, markUnpaid } from "./(gated)/payments/actions";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";
import { toMinutes } from "@/lib/slots";
import type { CardAction } from "@/lib/assistant/types";
import { MASK_TOKEN } from "@/lib/assistant/server/tools";

// SolvyAI's Confirmar and Desfazer on the website (docs/assistant-api.md
// §2.3a rule 10): a card's action runs through the SAME server actions as
// the screens, which re-check everything as the user. The action comes from
// the client, so every field is re-validated here; nothing is trusted.
//
// Results: { ok, id?, prev? } where prev is what Desfazer restores, or
// { ok: false, code } — slot_taken (the time was just taken: the panel asks
// the route for fresh times), appointment_not_cancellable (a cancel of one
// no longer scheduled / confirmed / late: the route says so), needs_confirm (a block / outside hours
// appeared after the card: nothing saved), or generic.

// noUndo: the save may already have told the patient (a booking decision,
// or a book / move / cancel for a patient with a SolvyMed account: an app
// push, or LINE, which also needs the account), so there is no Desfazer
// (UX 36, the same rule as the app): the toast offers "Abrir" instead.
export type SolvyAiSaveResult = { ok: true; id?: string; prev?: string; noUndo?: boolean } | { ok: false; code: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUIDISH = /^[0-9a-f-]{8,64}$/i;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function mapError(r: { error?: string; code?: string }): SolvyAiSaveResult {
  if (r.code === "slot_overlap") return { ok: false, code: "slot_taken" };
  if (r.code === "needs_confirm") return { ok: false, code: "needs_confirm" };
  return { ok: false, code: r.code ?? "generic" };
}

// The appointment's current status / payment, for Desfazer (RLS as the user).
type Row = { status: string; payment_status: string | null; date: string; start_time: string; end_time: string; patient_name: string | null; patient_id: string | null };
async function currentRow(id: string): Promise<Row | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const prof = await getEffectiveProfId(supabase, user.id);
  if (!prof) return null;
  const { data } = await supabase
    .from("appointments")
    .select("status, payment_status, date, start_time, end_time, patient_name, patient_id")
    .eq("id", id)
    .eq("professional_id", prof)
    .maybeSingle();
  return (data ?? null) as Row | null;
}

// Whether the patient has a SolvyMed account (so a change may reach them by
// push or LINE). Unsure (an error) counts as yes: no Desfazer.
async function patientConnected(patientId: string | null): Promise<boolean> {
  if (!patientId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_patient_auth_id", { p_patient_id: patientId });
  if (error) return true;
  return !!data;
}

// warningsAsked: the card's second question was asked and answered, so the
// warnings it named are accepted (the form's confirm_warnings).
export async function executeSolvyAiAction(action: CardAction, warningsAsked: boolean): Promise<SolvyAiSaveResult> {
  const a = action?.args ?? {};
  switch (action?.kind) {
    case "book_appointment": {
      const patientId = str(a.patientId);
      const date = str(a.date);
      const start = str(a.start);
      const dur = Number(a.durationMin ?? 30);
      if (!UUIDISH.test(patientId) || !DATE.test(date) || !TIME.test(start) || !Number.isInteger(dur) || dur < 5 || dur > 480) return { ok: false, code: "generic" };
      // The procedure the card showed (its name, payment type and, through
      // createAppointment, its price), re-read as the user; gone or
      // deactivated since the card → not saved.
      const procedure: Record<string, string> = {};
      if (a.procedureId !== undefined) {
        const procedureId = str(a.procedureId);
        if (!UUIDISH.test(procedureId)) return { ok: false, code: "generic" };
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const prof = user ? await getEffectiveProfId(supabase, user.id) : null;
        if (!prof) return { ok: false, code: "generic" };
        const { data: p } = await supabase.from("procedures").select("name, payment_type").eq("id", procedureId).eq("professional_id", prof).eq("active", true).maybeSingle();
        if (!p) return { ok: false, code: "generic" };
        const row = p as { name: string; payment_type: string };
        procedure.consultation_type = row.name;
        procedure.payment_type = row.payment_type;
      }
      // A series (the card's Repetir): the website's own recurrence fields,
      // re-validated by createAppointment (every / 2–52).
      const REPEAT: Record<string, string> = { week: "weekly", "2weeks": "biweekly", month: "monthly" };
      const rep = a.repeat as { every?: unknown; count?: unknown } | undefined;
      if (rep !== undefined && (typeof rep !== "object" || rep === null || !REPEAT[str(rep.every)] || !Number.isInteger(rep.count))) return { ok: false, code: "generic" };
      const r = await createAppointment(form({
        patient_id: patientId, date, start_time: start, duration_minutes: String(dur), type: "in-person", ...procedure,
        ...(rep ? { recurrence: REPEAT[str(rep.every)], occurrences: String(rep.count) } : {}),
        ...(warningsAsked ? { confirm_warnings: "1" } : {}),
      }));
      if (!("success" in r && r.success)) return mapError(r);
      return { ok: true, id: r.id, ...(rep || (await patientConnected(patientId)) ? { noUndo: true } : {}) };
    }
    case "cancel_appointment": {
      const id = str(a.appointmentId);
      if (!UUIDISH.test(id)) return { ok: false, code: "generic" };
      const before = await currentRow(id);
      if (!before) return { ok: false, code: "generic" };
      // Only a live appointment (the app's executor refuses the same way).
      if (!MOVABLE_STATUSES.includes(before.status)) return { ok: false, code: "appointment_not_cancellable" };
      const r = await updateAppointmentStatus(id, "cancelled");
      if (!("success" in r && r.success)) return mapError(r);
      return (await patientConnected(before.patient_id)) ? { ok: true, id, noUndo: true } : { ok: true, id, prev: before.status };
    }
    case "block_time": {
      const date = str(a.date);
      const start = str(a.start);
      const end = str(a.end);
      if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || end <= start) return { ok: false, code: "generic" };
      const r = await blockTime(form({
        date, start_time: start, duration_minutes: String(toMinutes(end) - toMinutes(start)), reason: str(a.reason).slice(0, 120),
      }));
      return "success" in r && r.success ? { ok: true, id: r.id } : mapError(r);
    }
    case "mark_paid": {
      const id = str(a.appointmentId);
      if (!UUIDISH.test(id) || typeof a.paid !== "boolean") return { ok: false, code: "generic" };
      const before = await currentRow(id);
      if (!before) return { ok: false, code: "generic" };
      const amount = a.amount === undefined || a.amount === null ? undefined : Number(a.amount);
      const r = a.paid ? await markPaid(id, amount) : await markUnpaid(id);
      return "success" in r && r.success ? { ok: true, id, prev: before.payment_status ?? "pending" } : mapError(r);
    }
    case "move_appointment": {
      const id = str(a.appointmentId);
      const date = str(a.date);
      const start = str(a.start);
      if (!UUIDISH.test(id) || !DATE.test(date) || !TIME.test(start)) return { ok: false, code: "generic" };
      // Still movable (moveAppointment checks too, in its write).
      const b = await currentRow(id);
      if (!b || !MOVABLE_STATUSES.includes(b.status)) return { ok: false, code: "generic" };
      const r = await moveAppointment(form({ id, date, start_time: start, ...(warningsAsked ? { confirm_warnings: "1" } : {}) }));
      // Desfazer moves it back.
      const prev = JSON.stringify({ date: b.date, start: b.start_time.slice(0, 5) });
      if (!("success" in r && r.success)) return mapError(r);
      return (await patientConnected(b.patient_id)) ? { ok: true, id, noUndo: true } : { ok: true, id, prev };
    }
    case "unblock_time": {
      const id = str(a.blockId);
      if (!UUIDISH.test(id)) return { ok: false, code: "generic" };
      // Only blocks, never an appointment (deleteAppointment deletes either).
      const b = await currentRow(id);
      if (!b || b.status !== "blocked") return { ok: false, code: "generic" };
      const r = await deleteAppointment(id);
      // Desfazer re-creates it: when and why.
      const prev = JSON.stringify({ date: b.date, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5), reason: b.patient_name && b.patient_name !== "Blocked" ? b.patient_name : "" });
      return "success" in r && r.success ? { ok: true, id, prev } : mapError(r);
    }
    case "booking_decision": {
      const id = str(a.appointmentId);
      const note = str(a.note).trim().slice(0, 300) || undefined;
      if (!UUIDISH.test(id) || (a.decision !== "confirm" && a.decision !== "reject")) return { ok: false, code: "generic" };
      // Still a request (rejectBooking itself doesn't check); a proposal can
      // only be declined.
      const b = await currentRow(id);
      if (!b || (b.status !== "tentative" && b.status !== "proposal")) return { ok: false, code: "generic" };
      if (a.decision === "confirm" && b.status !== "tentative") return { ok: false, code: "generic" };
      const r = a.decision === "confirm" ? await confirmBookingAndAddPatient(id, note) : await rejectBooking(id, note);
      // The patient is notified at once, so there's no Desfazer.
      return r.error ? { ok: false, code: "generic" } : { ok: true, id, noUndo: true };
    }
    case "add_patient": {
      const fullName = str(a.fullName).replace(/\s+/g, " ").trim().slice(0, 120);
      const birthDate = str(a.birthDate);
      if (fullName.length < 2 || (birthDate && !DATE.test(birthDate))) return { ok: false, code: "generic" };
      // Only the name and birth date come from SolvyAI: the chat masks phone,
      // email and IDs, so a placeholder ("[phone]") is never saved (7f).
      if (MASK_TOKEN.test(fullName) || Object.values(a).some((v) => typeof v === "string" && MASK_TOKEN.test(v))) return { ok: false, code: "generic" };
      // The form's own fields, for the practice's country (no ID from SolvyAI).
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const prof = user ? await getEffectiveProfId(supabase, user.id) : null;
      if (!user || !prof) return { ok: false, code: "generic" };
      const country = await lookupPracticeCountry(supabase, user.id, prof);
      if (!country.ok) return { ok: false, code: "generic" };
      const r = await createPatient(form({
        full_name: fullName, id_kind: patientIdKind(country.country),
        ...(birthDate ? { birth_date: birthDate } : {}),
        // "Create anyway" only when the card listed the similar patients.
        ...(a.createAnyway === true ? { force: "1" } : {}),
      }));
      if ("success" in r && r.success) return { ok: true, id: r.id };
      // A similar patient appeared after the card: nothing saved.
      return { ok: false, code: "code" in r ? r.code : "generic" };
    }
    default:
      // send Pix: app-only (WhatsApp) on the website (UX 36).
      return { ok: false, code: "generic" };
  }
}

// A patient SolvyAI just added may be deleted by Desfazer only while nothing
// uses it: no appointment at all (one booked meanwhile, in another tab or by
// the next card, would be orphaned: appointments.patient_id is ON DELETE SET
// NULL) and no clinical history (094 refuses that anyway). Any failed check
// counts as in use (the app's rule, mobile #141).
async function patientUnused(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", id);
  if (error || count !== 0) return false;
  const { data, error: previewError } = await supabase.rpc("get_patient_archive_preview", { p_patient_id: id });
  const row = (Array.isArray(data) ? data[0] : data) as { has_clinical_history?: boolean } | null;
  return !previewError && !!row && row.has_clinical_history === false;
}

// Desfazer, within 10 s: the inverse through the same paths.
export async function undoSolvyAiAction(action: CardAction, id: string, prev?: string): Promise<SolvyAiSaveResult> {
  if (!UUIDISH.test(str(id))) return { ok: false, code: "generic" };
  const done = (r: { success?: boolean; error?: string; code?: string }) => (r.success ? { ok: true as const, id } : mapError(r));
  switch (action?.kind) {
    case "book_appointment":
    case "block_time":
      return done(await deleteAppointment(id));
    case "cancel_appointment":
      // updateAppointmentStatus refuses anything outside its own list.
      return done(await updateAppointmentStatus(id, prev || "scheduled"));
    case "mark_paid":
      return done(prev === "paid" ? await markPaid(id) : await markUnpaid(id));
    case "move_appointment": {
      // Back where it was (the doctor had already accepted that slot).
      let p: { date?: unknown; start?: unknown } = {};
      try { p = JSON.parse(prev ?? "{}"); } catch { return { ok: false, code: "generic" }; }
      const date = str(p.date), start = str(p.start);
      if (!DATE.test(date) || !TIME.test(start)) return { ok: false, code: "generic" };
      const r = await moveAppointment(form({ id, date, start_time: start, confirm_warnings: "1" }));
      return "success" in r && r.success ? { ok: true, id } : mapError(r);
    }
    case "unblock_time": {
      // The block again, as it was.
      let p: { date?: unknown; start?: unknown; end?: unknown; reason?: unknown } = {};
      try { p = JSON.parse(prev ?? "{}"); } catch { return { ok: false, code: "generic" }; }
      const date = str(p.date), start = str(p.start), end = str(p.end);
      if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || end <= start) return { ok: false, code: "generic" };
      const r = await blockTime(form({ date, start_time: start, duration_minutes: String(toMinutes(end) - toMinutes(start)), reason: str(p.reason).slice(0, 120) }));
      return "success" in r && r.success ? { ok: true, id: r.id } : mapError(r);
    }
    case "add_patient": {
      if (!(await patientUnused(id))) return { ok: false, code: "generic" };
      const r = await deletePatient(id);
      return "success" in r && r.success ? { ok: true, id } : { ok: false, code: "generic" };
    }
    default:
      return { ok: false, code: "generic" };
  }
}
