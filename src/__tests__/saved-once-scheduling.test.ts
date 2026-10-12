import { beforeEach, describe, expect, it, vi } from "vitest";
import { samePatient, sameAppointment, seriesIds } from "@/lib/saveOnce";

// Saved once (migration 216) for new patients, appointments, series and
// blocked time: the form's id is sent with every try; a retry after a lost
// answer reads back the first save BEFORE the clash / duplicate checks
// (which would otherwise see that first save as another appointment or a
// patient already registered).

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";

describe("lib/saveOnce (scheduling)", () => {
  it("a series derives one id per date from the form's id", () => {
    const ids = seriesIds(ID, 3);
    expect(ids[0]).toBe(ID);
    expect(ids[1]).toBe("0f1e2d3c-4b5a-4968-8776-655443322111");
    expect(ids[2]).toBe("0f1e2d3c-4b5a-4968-8776-655443322112");
    expect(new Set(seriesIds(ID, 52)).size).toBe(52);
    // The last 8 hex digits wrap instead of growing.
    const top = "0f1e2d3c-4b5a-4968-8776-6554ffffffff";
    expect(seriesIds(top, 2)[1]).toBe("0f1e2d3c-4b5a-4968-8776-655400000000");
  });

  it("samePatient: trimmed, case-insensitive, missing = empty", () => {
    const stored = { full_name: "Ana Souza", email: "ana@x.com", phone: null, birth_date: "1990-01-02", cpf: "123" };
    expect(samePatient(stored, { full_name: " Ana Souza ", email: "ANA@x.com", birth_date: "1990-01-02", cpf: "123" })).toBe(true);
    expect(samePatient(stored, { full_name: "Ana Souza", email: "ana@x.com", birth_date: "1990-01-03", cpf: "123" })).toBe(false);
  });

  it("sameAppointment: times on HH:MM", () => {
    const stored = { date: "2026-10-20", start_time: "09:00:00", end_time: "09:30:00", patient_id: "p1", status: "scheduled" };
    expect(sameAppointment(stored, { date: "2026-10-20", start: "09:00", end: "09:30", patientId: "p1", status: "scheduled" })).toBe(true);
    expect(sameAppointment(stored, { date: "2026-10-20", start: "10:00", end: "10:30", patientId: "p1", status: "scheduled" })).toBe(false);
    expect(sameAppointment({ ...stored, patient_id: null, status: "blocked" }, { date: "2026-10-20", start: "09:00", end: "09:30", patientId: null, status: "blocked" })).toBe(true);
  });
});

// ── The server actions, with a fake database ──
const db = vi.hoisted(() => ({
  // Read-back of the first save (select by the form's id).
  stored: null as null | Record<string, unknown>,
  insertError: null as null | { code: string; message: string },
  reads: [] as { table: string; cols: string }[],
  inserts: [] as { table: string; row: unknown }[],
  rpcs: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true, getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("@/lib/practiceCountry", () => ({
  lookupPracticeCountry: async () => ({ ok: true, country: "BR" }),
  getPracticeCountry: async () => "BR",
}));
vi.mock("@/lib/patientFields", async (orig) => ({ ...(await orig<typeof import("@/lib/patientFields")>()), readPatientFieldRules: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string) => { db.rpcs.push(fn); return { data: [], error: null }; },
    from: (table: string) => {
      let cols = "";
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const m of ["eq", "neq", "in", "is", "not", "or", "gt", "gte", "lt", "lte", "ilike", "order", "limit", "range"]) q[m] = chain;
      q.select = (c = "") => { cols = c; db.reads.push({ table, cols }); return q; };
      q.maybeSingle = async () => ({ data: cols.includes("status") || cols.includes("passport_number") ? db.stored : null, error: null });
      q.single = async () => ({ data: null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      q.insert = (row: unknown) => {
        db.inserts.push({ table, row });
        const res = { data: db.insertError ? null : { id: (Array.isArray(row) ? row[0] : (row as { id?: string })).id ?? "server-id" }, error: db.insertError };
        const sel: Record<string, unknown> = { single: async () => res, order: () => sel, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: db.insertError ? null : [res.data], error: db.insertError }).then(ok) };
        return Object.assign(Promise.resolve(res), { select: () => sel });
      };
      return q;
    },
  }),
}));

import { blockTime, createAppointment } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/actions";
import { createPatient } from "@/app/[locale]/(site)/dashboard/(gated)/patients/actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const appt = { patient_name: "Ana Souza", date: "2026-10-20", start_time: "09:00", duration_minutes: "30" };
const storedAppt = { id: ID, date: "2026-10-20", start_time: "09:00:00", end_time: "09:30:00", patient_id: null, status: "scheduled" };

beforeEach(() => {
  db.stored = null; db.insertError = null; db.reads = []; db.inserts = []; db.rpcs = [];
});

describe("createAppointment", () => {
  it("a retry finds the first save before any clash check, and inserts nothing", async () => {
    db.stored = storedAppt;
    const r = await createAppointment(fd({ ...appt, client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID });
    expect(r).not.toHaveProperty("alreadySavedChanged", true);
    expect(db.inserts).toHaveLength(0);
    // Reads: the patient by name, then the read-back, nothing after it.
    expect(db.reads.at(-1)?.cols).toContain("status");
    expect(db.reads.filter((x) => x.table === "appointments")).toHaveLength(1);
  });

  it("a retry with other details: the stored one, flagged as changed", async () => {
    db.stored = { ...storedAppt, start_time: "08:00:00", end_time: "08:30:00" };
    const r = await createAppointment(fd({ ...appt, client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID, alreadySavedChanged: true });
    expect(db.inserts).toHaveLength(0);
  });

  it("the first try saves under the form's id; a series gets one id per date", async () => {
    await createAppointment(fd({ ...appt, client_id: ID, client_try: "1" }));
    const one = db.inserts.find((x) => x.table === "appointments")?.row as { id: string }[] | { id: string };
    expect((Array.isArray(one) ? one[0] : one).id).toBe(ID);

    db.inserts = [];
    await createAppointment(fd({ ...appt, recurrence: "weekly", occurrences: "3", client_id: ID, client_try: "1" }));
    const rows = db.inserts.find((x) => x.table === "appointments")?.row as { id: string }[];
    expect(rows.map((x) => x.id)).toEqual(seriesIds(ID, 3));
  });

  it("23505 on the insert (the first try landed meanwhile): the first save", async () => {
    db.insertError = { code: "23505", message: "duplicate key" };
    db.stored = storedAppt;
    const r = await createAppointment(fd({ ...appt, client_id: ID, client_try: "1" }));
    expect(r).toMatchObject({ success: true, id: ID });
  });

  it("no client id: as before (no id sent)", async () => {
    await createAppointment(fd(appt));
    const row = db.inserts.find((x) => x.table === "appointments")?.row as Record<string, unknown>[] | Record<string, unknown>;
    expect(Array.isArray(row) ? row[0] : row).not.toHaveProperty("id");
  });
});

describe("blockTime", () => {
  const block = { date: "2026-10-20", start_time: "12:00", duration_minutes: "60", reason: "Lunch" };
  const storedBlock = { id: ID, date: "2026-10-20", start_time: "12:00:00", end_time: "13:00:00", patient_id: null, status: "blocked" };

  it("the first try saves under the form's id", async () => {
    await blockTime(fd({ ...block, client_id: ID, client_try: "1" }));
    expect(db.inserts[0].row).toMatchObject({ id: ID, status: "blocked" });
  });

  it("a retry returns the first block without a second one", async () => {
    db.stored = storedBlock;
    const r = await blockTime(fd({ ...block, client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID });
    expect(r).not.toHaveProperty("alreadySavedChanged", true);
    expect(db.inserts).toHaveLength(0);
  });

  it("a retry with another time: flagged as changed", async () => {
    db.stored = storedBlock;
    const r = await blockTime(fd({ ...block, start_time: "14:00", client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID, alreadySavedChanged: true });
  });
});

describe("createPatient", () => {
  const patient = { full_name: "Ana Souza", email: "ana@x.com", birth_date: "1990-01-02", id_kind: "BR" };

  it("a retry finds the first save before the duplicate checks", async () => {
    db.stored = { id: ID, full_name: "Ana Souza", email: "ana@x.com", birth_date: "1990-01-02" };
    const r = await createPatient(fd({ ...patient, client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID });
    expect(r).not.toHaveProperty("alreadySavedChanged", true);
    // Not "already registered" (the e-mail check) nor "similar" (the RPC).
    expect(db.reads).toHaveLength(1);
    expect(db.rpcs).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it("a retry with other details: the stored one, flagged as changed", async () => {
    db.stored = { id: ID, full_name: "Ana Souza", email: "ana@x.com", birth_date: "1990-01-03" };
    const r = await createPatient(fd({ ...patient, client_id: ID, client_try: "2" }));
    expect(r).toMatchObject({ success: true, id: ID, alreadySavedChanged: true });
  });

  it("the first try saves under the form's id", async () => {
    await createPatient(fd({ ...patient, client_id: ID, client_try: "1" }));
    expect(db.inserts.find((x) => x.table === "patients")?.row).toMatchObject({ id: ID, full_name: "Ana Souza" });
  });
});
