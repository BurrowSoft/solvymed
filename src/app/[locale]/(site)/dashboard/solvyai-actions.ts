"use server";

import { createAppointment, blockTime, updateAppointmentStatus, deleteAppointment } from "./schedule/actions";
import { markPaid, markUnpaid } from "./payments/actions";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";
import { toMinutes } from "@/lib/slots";
import type { CardAction } from "@/lib/assistant/types";

// SolvyAI's Confirmar and Desfazer on the website (docs/assistant-api.md
// §2.3a rule 10): a card's action runs through the SAME server actions as
// the screens, which re-check everything as the user. The action comes from
// the client, so every field is re-validated here; nothing is trusted.
//
// Results: { ok, id?, prev? } where prev is what Desfazer restores, or
// { ok: false, code } — slot_taken (the time was just taken: the panel asks
// the route for fresh times), needs_confirm (a block / outside hours
// appeared after the card: nothing saved), or generic.

export type SolvyAiSaveResult = { ok: true; id?: string; prev?: string } | { ok: false; code: string };

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
async function current(id: string): Promise<{ status: string; payment_status: string | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const prof = await getEffectiveProfId(supabase, user.id);
  if (!prof) return null;
  const { data } = await supabase.from("appointments").select("status, payment_status").eq("id", id).eq("professional_id", prof).maybeSingle();
  return (data ?? null) as { status: string; payment_status: string | null } | null;
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
      const r = await createAppointment(form({
        patient_id: patientId, date, start_time: start, duration_minutes: String(dur),
        ...(warningsAsked ? { confirm_warnings: "1" } : {}),
      }));
      return "success" in r && r.success ? { ok: true, id: r.id } : mapError(r);
    }
    case "cancel_appointment": {
      const id = str(a.appointmentId);
      if (!UUIDISH.test(id)) return { ok: false, code: "generic" };
      const before = await current(id);
      if (!before) return { ok: false, code: "generic" };
      const r = await updateAppointmentStatus(id, "cancelled");
      return "success" in r && r.success ? { ok: true, id, prev: before.status } : mapError(r);
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
      const before = await current(id);
      if (!before) return { ok: false, code: "generic" };
      const amount = a.amount === undefined || a.amount === null ? undefined : Number(a.amount);
      const r = a.paid ? await markPaid(id, amount) : await markUnpaid(id);
      return "success" in r && r.success ? { ok: true, id, prev: before.payment_status ?? "pending" } : mapError(r);
    }
    default:
      // Part 2 actions (move, unblock, …) aren't offered by the route yet.
      return { ok: false, code: "generic" };
  }
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
    default:
      return { ok: false, code: "generic" };
  }
}
