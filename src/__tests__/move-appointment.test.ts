import { beforeEach, describe, expect, it, vi } from "vitest";

// The website's Remarcar (UX 36): the same checks as booking, only the date
// and start change, the patient told old → new.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    appointments: [] as Row[],
    hours: null as unknown,
    updates: [] as { values: Row; filters: [string, string, unknown][] }[],
    told: [] as unknown[],
  };
  function query(table: string) {
    // Copies, like a real query (an update never changes a row already read).
    let rows = table === "appointments" ? state.appointments.map((r) => ({ ...r })) : [];
    const filters: [string, string, unknown][] = [];
    let update: Row | null = null;
    let single = false;
    const apply = (op: string, c: string, v: unknown, keep: (r: Row) => boolean) => { filters.push([op, c, v]); rows = rows.filter(keep); return q; };
    const q = {
      select: () => q,
      update: (v: Row) => { update = v; return q; },
      eq: (c: string, v: unknown) => apply("eq", c, v, (r) => r[c] === v),
      neq: (c: string, v: unknown) => apply("neq", c, v, (r) => r[c] !== v),
      in: (c: string, v: unknown[]) => apply("in", c, v, (r) => v.includes(r[c])),
      not: (c: string, _o: string, list: string) => apply("not", c, list, (r) => !list.slice(1, -1).split(",").includes(String(r[c]))),
      lt: (c: string, v: string) => apply("lt", c, v, (r) => String(r[c]).slice(0, 5) < v),
      gt: (c: string, v: string) => apply("gt", c, v, (r) => String(r[c]).slice(0, 5) > v),
      order: () => q,
      limit: () => q,
      maybeSingle: () => { single = true; return q; },
      then: (res: (v: unknown) => unknown) => {
        if (update) {
          state.updates.push({ values: update, filters });
          for (const r of rows) Object.assign(state.appointments.find((x) => x.id === r.id)!, update);
          return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res);
      },
    };
    return q;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: query,
    rpc: async () => ({ data: state.hours, error: null }),
  };
  return { state, client };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/clinicNotify", () => ({ tellPatient: async (_db: unknown, change: unknown) => { h.state.told.push(change); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { moveAppointment } from "@/app/[locale]/(site)/dashboard/schedule/actions";

const appt = (over: Record<string, unknown> = {}) => ({
  id: "a-1", professional_id: "doc-1", status: "scheduled", date: "2026-10-05", start_time: "09:00:00", end_time: "09:50:00",
  duration_minutes: 50, patient_id: "p-1", patient_auth_id: null, patient_name: "Maria", ...over,
});
const move = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ id: "a-1", ...fields })) f.set(k, v);
  return moveAppointment(f);
};

beforeEach(() => {
  h.state.appointments = [appt()];
  h.state.hours = { mon: { enabled: true, start: "08:00", end: "18:00" }, tue: { enabled: true, start: "08:00", end: "18:00" }, sat: { enabled: false, start: "08:00", end: "12:00" } };
  h.state.updates = [];
  h.state.told = [];
});

describe("moveAppointment", () => {
  it("moves the date and start, keeps the duration, and tells the patient old → new", async () => {
    expect(await move({ date: "2026-10-06", start_time: "14:00" })).toEqual({ success: true, id: "a-1" });
    expect(h.state.updates[0].values).toEqual({ date: "2026-10-06", start_time: "14:00", end_time: "14:50" });
    // Only while it's still movable (the write itself checks).
    expect(h.state.updates[0].filters).toContainEqual(["in", "status", ["scheduled", "confirmed", "late"]]);
    expect(h.state.told).toEqual([{
      kind: "moved", practiceId: "doc-1", isSecretary: false, patientAuthId: null, patientId: "p-1", status: "scheduled",
      date: "2026-10-06", startTime: "14:00", from: { date: "2026-10-05", startTime: "09:00:00" },
    }]);
  });

  it("another appointment there is a hard stop saying with whom (not itself)", async () => {
    h.state.appointments.push(appt({ id: "a-2", patient_name: "João", date: "2026-10-06", start_time: "14:30:00", end_time: "15:00:00", duration_minutes: 30 }));
    expect(await move({ date: "2026-10-06", start_time: "14:00" })).toMatchObject({ code: "slot_overlap", overlap: { name: "João", time: "14:30", durationMin: 30 } });
    // Overlapping its own old slot is fine.
    expect(await move({ date: "2026-10-05", start_time: "09:30" })).toMatchObject({ success: true });
  });

  it("blocked time / outside the hours / a day off: asked once, then moved with confirm_warnings", async () => {
    h.state.appointments.push(appt({ id: "b-1", status: "blocked", date: "2026-10-06", start_time: "12:00:00", end_time: "13:00:00" }));
    expect(await move({ date: "2026-10-06", start_time: "12:00" })).toMatchObject({ code: "needs_confirm", blocked: { start: "12:00", end: "13:00" } });
    expect(await move({ date: "2026-10-06", start_time: "19:00" })).toMatchObject({ code: "needs_confirm", hours: { kind: "outside" } });
    expect(await move({ date: "2026-10-10", start_time: "10:00" })).toMatchObject({ code: "needs_confirm", hours: { kind: "day_off" } });
    expect(h.state.updates).toEqual([]);
    expect(await move({ date: "2026-10-06", start_time: "12:00", confirm_warnings: "1" })).toMatchObject({ success: true });
  });

  it("only booked appointments move; requests go to their card; nothing changes → nothing saved or told", async () => {
    h.state.appointments = [appt({ status: "cancelled" })];
    expect(await move({ date: "2026-10-06", start_time: "10:00" })).toMatchObject({ code: "not_movable" });
    h.state.appointments = [appt({ status: "tentative" })];
    expect(await move({ date: "2026-10-06", start_time: "10:00" })).toMatchObject({ code: "use_booking_card" });
    h.state.appointments = [appt()];
    expect(await move({ date: "2026-10-05", start_time: "09:00" })).toEqual({ success: true, id: "a-1" });
    expect(h.state.updates).toEqual([]);
    expect(h.state.told).toEqual([]);
  });

  it("past midnight and Buddhist-era years are refused", async () => {
    expect(await move({ date: "2026-10-06", start_time: "23:30" })).toMatchObject({ code: "past_midnight" });
    expect(await move({ date: "2569-10-06", start_time: "10:00" })).toMatchObject({ code: "date_buddhist_era" });
  });
});
