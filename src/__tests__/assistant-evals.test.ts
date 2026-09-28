import { describe, expect, it } from "vitest";
import data from "@/lib/assistant/evals/cases.json";

// The SolvyAI no-guessing eval set (docs/assistant-api.md §7). The runner
// comes with the route; until then these checks keep the fixtures sound:
// every id they name exists, every tool is in the contract, every date is a
// real Gregorian date, expected cards don't sit on a conflict (and expected
// conflicts really are one), and the §2.3/§2.3a traps are all covered.

const BEHAVIORS = ["ask", "pick", "propose", "slot_choice", "answer", "reshow_card", "refuse_action", "refuse_clinical", "offtopic"];
const PROPOSAL_TOOLS = [
  "propose_book_appointment", "propose_move_appointment", "propose_cancel_appointment",
  "propose_block_time", "propose_unblock_time", "propose_booking_decision",
  "propose_add_patient", "propose_mark_paid", "propose_send_pix",
];
const READ_TOOLS = ["list_appointments", "find_free_slots", "find_patients", "payments_summary"];
const WARNINGS = ["blocked", "outside_hours", "same_patient_day", "pending_request_overlap"];

type Appt = { id: string; patientId: string; date: string; start: string; end: string };
type Ctx = { patients: { id: string }[]; appointments: Appt[] };
type Case = {
  id: string; lang: string; context: string; mode: string; trap?: string; pendingUx?: string;
  messages: { role: string; text: string }[];
  event?: { type: string; code: string };
  expect: {
    behavior: string; reason?: string; conflictIds?: string[]; conflictDates?: string[];
    warnings?: string[]; secondConfirm?: boolean;
    pickOf?: string; pickIds?: string[]; pickValues?: string[];
    proposals?: { tool: string; args: Record<string, unknown> }[]; readTools?: string[];
  };
};
const contexts = data.contexts as Record<string, Ctx>;
const cases = data.cases as Case[];

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
// Existing appointments overlapping [start, start + dur) on that date.
const overlaps = (ctx: Ctx, date: string, start: string, dur: number, except?: string) =>
  ctx.appointments.filter((a) => a.id !== except && a.date === date && mins(a.start) < mins(start) + dur && mins(start) < mins(a.end));

const isIsoDate = (s: unknown) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y < 2400 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

describe("SolvyAI eval fixtures", () => {
  it("about 50+ cases, in pt-BR, en and th, with unique ids and no open product questions", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    for (const lang of ["pt-BR", "en", "th"]) expect(cases.filter((c) => c.lang === lang).length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.filter((c) => c.pendingUx)).toEqual([]);
  });

  it("covers every §2.3 / §2.3a trap", () => {
    const traps = new Set(cases.map((c) => c.trap));
    for (const t of [
      "missing_time", "two_patients", "relative_weekday", "vague_cancel", "typed_confirmation", "bulk_action",
      "prompt_injection", "forbidden_action", "buddhist_year",
      "schedule_conflict", "blocked_time", "outside_hours", "same_patient_day", "recurring_conflict", "confirm_failed",
    ]) {
      expect(traps, t).toContain(t);
    }
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s is well-formed", (_id, c) => {
    const ctx = contexts[c.context];
    expect(ctx).toBeDefined();
    expect(["help", "actions"]).toContain(c.mode);
    expect(BEHAVIORS).toContain(c.expect.behavior);
    // The next turn answers the user's message, or the client's confirm_failed event.
    if (c.event) expect(c.event.type).toBe("confirm_failed");
    else expect(c.messages.at(-1)?.role).toBe("user");
    for (const m of c.messages) expect(m.text.length).toBeLessThanOrEqual(500);

    const ids = new Set([...ctx.patients.map((p) => p.id), ...ctx.appointments.map((a) => a.id)]);
    const e = c.expect;
    if (e.behavior === "pick") {
      expect(e.pickOf).toBeDefined();
      expect((e.pickIds ?? e.pickValues ?? []).length).toBeGreaterThanOrEqual(2);
      for (const id of e.pickIds ?? []) expect(ids.has(id), id).toBe(true);
      for (const v of e.pickValues ?? []) expect(isIsoDate(v), v).toBe(true);
    }
    if (e.behavior === "propose") {
      // Proposals need actions on; help mode never proposes.
      expect(c.mode).toBe("actions");
      expect(e.proposals?.length).toBeGreaterThanOrEqual(1);
      for (const p of e.proposals!) {
        expect(PROPOSAL_TOOLS).toContain(p.tool);
        for (const k of ["patientId", "appointmentId"]) {
          if (k in p.args) expect(ids.has(p.args[k] as string), `${k}=${p.args[k]}`).toBe(true);
        }
        if ("date" in p.args) expect(isIsoDate(p.args.date)).toBe(true);
        for (const k of ["start", "end"]) if (k in p.args) expect(p.args[k]).toMatch(HHMM);
        // A card is only expected where the slot is free: a conflict is a slot_choice.
        if ((p.tool === "propose_book_appointment" || p.tool === "propose_move_appointment") && typeof p.args.date === "string") {
          const clash = overlaps(ctx, p.args.date, p.args.start as string, 30, p.args.appointmentId as string | undefined);
          expect(clash.map((a) => a.id), c.id).toEqual([]);
        }
      }
      for (const w of e.warnings ?? []) expect(WARNINGS).toContain(w);
      // Blocked / outside hours ask twice, like the app.
      if (e.warnings?.some((w) => w === "blocked" || w === "outside_hours")) expect(e.secondConfirm).toBe(true);
    } else {
      expect(e.proposals).toBeUndefined();
    }
    if (e.behavior === "slot_choice") {
      expect(["conflict", "recurring_conflict", "confirm_failed"]).toContain(e.reason);
      for (const id of e.conflictIds ?? []) expect(ids.has(id), id).toBe(true);
      for (const d of e.conflictDates ?? []) expect(isIsoDate(d), d).toBe(true);
      if (e.reason === "confirm_failed") expect(c.event).toBeDefined();
      if (e.reason === "recurring_conflict") expect(e.conflictDates?.length).toBeGreaterThanOrEqual(1);
    }
    for (const t of e.readTools ?? []) expect(READ_TOOLS).toContain(t);
    if (c.mode === "help") expect(e.readTools ?? []).toEqual([]);
  });

  it("the conflict cases really are conflicts in their context", () => {
    const sp = contexts.sp;
    // João Friday 02/10 10:00 lands on Ana Costa (a4); João's move to 15:00 on Maria Souza (a5).
    expect(overlaps(sp, "2026-10-02", "10:00", 30).map((a) => a.id)).toEqual(["a4"]);
    expect(overlaps(sp, "2026-10-02", "15:00", 30, "a2").map((a) => a.id)).toEqual(["a5"]);
    // Ana every Wednesday at 10:00 from 30/09: the first lands on Maria Silva (a3).
    expect(overlaps(sp, "2026-09-30", "10:00", 30).map((a) => a.id)).toEqual(["a3"]);
  });
});
