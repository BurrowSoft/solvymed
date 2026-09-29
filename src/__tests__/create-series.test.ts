import { beforeEach, describe, expect, it, vi } from "vitest";

// Recurring appointments on the website (the app's rules): every date
// checked, the date named, one insert (all or nothing), one push.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    appointments: [] as Row[],
    patients: [{ id: "p-1", professional_id: "doc-1", full_name: "Maria Silva", archived_at: null }] as Row[],
    procedures: [] as Row[],
    hours: null as unknown,
    inserts: [] as Row[][],
    insertError: null as { code?: string; message?: string } | null,
    told: [] as unknown[],
  };
  function query(table: string) {
    let rows = ((state as unknown as Record<string, Row[]>)[table] ?? []).map((r) => ({ ...r }));
    let insert: Row[] | null = null;
    let single = false;
    const q = {
      select: () => q,
      insert: (v: Row | Row[]) => { insert = Array.isArray(v) ? v : [v]; return q; },
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      ilike: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      not: (c: string, _o: string, list: string) => { rows = rows.filter((r) => !list.slice(1, -1).split(",").includes(String(r[c]))); return q; },
      lt: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]).slice(0, 5) < v); return q; },
      gt: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]).slice(0, 5) > v); return q; },
      order: (c: string) => { rows.sort((a, b) => String(a[c]).localeCompare(String(b[c]))); return q; },
      limit: () => q,
      maybeSingle: () => { single = true; return q; },
      then: (res: (v: unknown) => unknown) => {
        if (insert) {
          if (state.insertError) return Promise.resolve({ data: null, error: state.insertError }).then(res);
          state.inserts.push(insert);
          return Promise.resolve({ data: insert.map((r, i) => ({ id: `new-${i}`, date: r.date })), error: null }).then(res);
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

import { createAppointment } from "@/app/[locale]/(site)/dashboard/schedule/actions";

const book = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ patient_name: "Maria Silva", date: "2026-10-05", start_time: "10:00", duration_minutes: "30", ...fields })) f.set(k, v);
  return createAppointment(f);
};

beforeEach(() => {
  h.state.appointments = [];
  h.state.hours = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { enabled: d !== "sat" && d !== "sun", start: "08:00", end: "18:00" }]));
  h.state.inserts = [];
  h.state.insertError = null;
  h.state.told = [];
});

describe("createAppointment: a recurring series", () => {
  it("weekly × 4: one insert with every date; one push naming how many", async () => {
    expect(await book({ recurrence: "weekly", occurrences: "4" })).toEqual({ success: true, id: "new-0", count: 4 });
    expect(h.state.inserts).toHaveLength(1);
    expect(h.state.inserts[0].map((r) => r.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(h.state.told).toEqual([expect.objectContaining({ kind: "booked", date: "2026-10-05", dates: ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"] })]);
  });

  it("another appointment on any date: nothing saved, the date named", async () => {
    h.state.appointments.push({ professional_id: "doc-1", date: "2026-10-19", start_time: "10:00:00", end_time: "10:30:00", status: "scheduled", patient_name: "João", duration_minutes: 30 });
    expect(await book({ recurrence: "weekly", occurrences: "4" })).toMatchObject({ code: "slot_overlap", overlap: { name: "João", date: "2026-10-19" } });
    expect(h.state.inserts).toEqual([]);
  });

  it("blocked time / outside the hours on one date: asked once, naming it; then all saved", async () => {
    h.state.appointments.push({ professional_id: "doc-1", date: "2026-10-12", start_time: "09:00:00", end_time: "12:00:00", status: "blocked" });
    expect(await book({ recurrence: "weekly", occurrences: "3" })).toMatchObject({ code: "needs_confirm", blocked: { date: "2026-10-12" }, hours: null });
    expect(await book({ recurrence: "weekly", occurrences: "3", confirm_warnings: "1" })).toMatchObject({ success: true, count: 3 });
    // A date on a day off (monthly: 2026-10-05, 11-05, 12-05 is a Saturday).
    h.state.appointments = [];
    expect(await book({ recurrence: "monthly", occurrences: "3" })).toMatchObject({ code: "needs_confirm", hours: { kind: "day_off" }, hoursDate: "2026-12-05" });
  });

  it("taken between the check and the insert (23P01): nothing saved (one statement)", async () => {
    h.state.insertError = { code: "23P01", message: "conflicting key value violates exclusion constraint" };
    expect(await book({ recurrence: "biweekly", occurrences: "3" })).toMatchObject({ code: "slot_overlap" });
    expect(h.state.told).toEqual([]);
  });

  it("2 to 52 appointments; an unknown repeat is a single booking", async () => {
    expect(await book({ recurrence: "weekly", occurrences: "1" })).toMatchObject({ code: "invalid_occurrences" });
    expect(await book({ recurrence: "weekly", occurrences: "53" })).toMatchObject({ code: "invalid_occurrences" });
    expect(await book({ recurrence: "daily", occurrences: "5" })).toMatchObject({ success: true, count: 1 });
    // A single booking names no date in its messages.
    h.state.appointments.push({ professional_id: "doc-1", date: "2026-10-05", start_time: "10:00:00", end_time: "10:30:00", status: "scheduled", patient_name: "João", duration_minutes: 30 });
    expect(await book({})).toMatchObject({ code: "slot_overlap", overlap: { date: null } });
  });
});
