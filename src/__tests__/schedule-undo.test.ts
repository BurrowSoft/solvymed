import { beforeEach, describe, expect, it, vi } from "vitest";

// The Agenda's Desfazer (UX 2026-09-30; the app's undoAction order):
// still as left → the queued notice dropped → revert; a failed revert tells
// the patient again. The token is client data: re-validated, practice-scoped.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    appointments: [] as Row[],
    steps: [] as string[],
    cancelOk: true,
    writeError: null as { code?: string; message?: string } | null,
  };
  function query() {
    let rows = state.appointments.map((r) => ({ ...r }));
    let update: Row | null = null;
    let del = false;
    const q = {
      select: () => q,
      update: (v: Row) => { update = v; return q; },
      delete: () => { del = true; return q; },
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      then: (res: (v: unknown) => unknown) => {
        if ((update || del) && state.writeError) { state.steps.push("revert-failed"); return Promise.resolve({ data: null, error: state.writeError }).then(res); }
        if (update) {
          state.steps.push("revert");
          for (const r of rows) Object.assign(state.appointments.find((x) => x.id === r.id)!, update);
          return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        if (del) {
          state.steps.push("revert");
          state.appointments = state.appointments.filter((x) => !rows.some((r) => r.id === x.id));
          return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        state.steps.push("read");
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return q;
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) }, from: query, rpc: async () => ({ data: null, error: null }) };
  return { state, client };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/patientNotice", () => ({
  cancelPatientNotice: async () => { h.state.steps.push("cancel-notice"); return h.state.cancelOk; },
  enqueuePatientNotice: async (_db: unknown, kind: string) => { h.state.steps.push(`retell:${kind}`); return 99; },
  NoticeOutboxUnavailable: class extends Error {},
}));

import { undoScheduleChange } from "@/app/[locale]/(site)/dashboard/schedule/actions";
import type { UndoToken } from "@/lib/scheduleUndo";

const A = "0f3b9c2e-1111-4222-8333-444455556666";
const B = "1f3b9c2e-1111-4222-8333-444455556666";
const row = (id: string, o: Record<string, unknown> = {}) => ({ id, professional_id: "doc-1", date: "2026-10-05", start_time: "09:00:00", status: "scheduled", ...o });

beforeEach(() => { h.state.appointments = []; h.state.steps = []; h.state.cancelOk = true; h.state.writeError = null; });

describe("Desfazer in the Agenda", () => {
  it("a booked series: still as left → the notice dropped → the whole series deleted", async () => {
    h.state.appointments = [row(A), row(B, { date: "2026-10-12" })];
    const t: UndoToken = { kind: "booked", ids: [A, B], told: 7, dates: ["2026-10-05", "2026-10-12"], start: "09:00", status: "scheduled" };
    expect(await undoScheduleChange(t)).toEqual({ ok: true });
    expect(h.state.steps).toEqual(["read", "cancel-notice", "revert"]);
    expect(h.state.appointments).toEqual([]);
  });

  it("changed meanwhile: refused before anything (the notice stays)", async () => {
    h.state.appointments = [row(A, { start_time: "10:00:00" })];
    expect(await undoScheduleChange({ kind: "booked", ids: [A], told: 7, dates: ["2026-10-05"], start: "09:00", status: "scheduled" })).toEqual({ ok: false });
    expect(h.state.steps).toEqual(["read"]);
  });

  it("the notice already on its way: refused, nothing reverted", async () => {
    h.state.appointments = [row(A, { status: "cancelled" })];
    h.state.cancelOk = false;
    expect(await undoScheduleChange({ kind: "cancelled", ids: [A], told: 7, dates: ["2026-10-05"], start: "09:00", status: "cancelled", prevStatus: "confirmed" })).toEqual({ ok: false });
    expect(h.state.steps).toEqual(["read", "cancel-notice"]);
    expect(h.state.appointments[0].status).toBe("cancelled");
  });

  it("a cancel: the old status back; nobody told (null) needs no notice step", async () => {
    h.state.appointments = [row(A, { status: "cancelled" })];
    expect(await undoScheduleChange({ kind: "cancelled", ids: [A], told: null, dates: ["2026-10-05"], start: "09:00", status: "cancelled", prevStatus: "confirmed" })).toEqual({ ok: true });
    expect(h.state.steps).toEqual(["read", "revert"]);
    expect(h.state.appointments[0].status).toBe("confirmed");
  });

  it("a move: back to the old slot; if that fails (taken meanwhile) the patient is told again", async () => {
    h.state.appointments = [row(A, { date: "2026-10-06", start_time: "14:00:00" })];
    const t: UndoToken = { kind: "moved", ids: [A], told: 7, dates: ["2026-10-06"], start: "14:00", status: "scheduled", prevDate: "2026-10-05", prevStart: "09:00", prevEnd: "09:30" };
    expect(await undoScheduleChange(t)).toEqual({ ok: true });
    expect(h.state.appointments[0]).toMatchObject({ date: "2026-10-05", start_time: "09:00", end_time: "09:30" });

    h.state.steps = [];
    h.state.appointments = [row(A, { date: "2026-10-06", start_time: "14:00:00" })];
    h.state.writeError = { code: "23P01", message: "overlap" };
    expect(await undoScheduleChange(t)).toEqual({ ok: false });
    expect(h.state.steps).toEqual(["read", "cancel-notice", "revert-failed", "retell:moved"]);
  });

  it("a bad token (client data) does nothing", async () => {
    const bad = [
      { kind: "deleted", ids: [A], told: null, dates: ["2026-10-05"], start: "09:00", status: "scheduled" },
      { kind: "booked", ids: ["x; drop"], told: null, dates: ["2026-10-05"], start: "09:00", status: "scheduled" },
      { kind: "moved", ids: [A, B], told: null, dates: ["2026-10-05"], start: "09:00", status: "scheduled" },
      { kind: "cancelled", ids: [A], told: null, dates: ["5/10/2026"], start: "09:00", status: "cancelled" },
    ];
    for (const t of bad) expect(await undoScheduleChange(t as UndoToken)).toEqual({ ok: false });
    expect(h.state.steps).toEqual([]);
  });
});
