import { describe, expect, it } from "vitest";
import { ADD_ROWS_BATCH, ImportError, commitImport, lastUndoableImport, problemRows, stageImport, undoImport, validateImport, type ImportDb } from "@/lib/import/api";

// The import's calls to 130/131, as the doctor, against a fake client.

function fakeDb(results: Record<string, { data?: unknown; error?: { message: string } | null }>, rows: unknown[] = [], last: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const filters: string[] = [];
  const range = (a: number, b: number) => Promise.resolve({ data: rows.slice(a, b + 1), error: null });
  const db: ImportDb = {
    rpc: (fn, args) => { calls.push({ fn, args }); const r = results[fn] ?? { data: null }; return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }); },
    from: () => ({ select: () => ({ eq: (col: string, v: unknown) => ({
      or: (f: string) => { filters.push(f); return { order: () => ({ range }) }; }, order: () => ({ range }),
      gte: (c: string, since: unknown) => { filters.push(`${col}=${String(v)};${c}>=${String(since)}`); return { order: () => ({ limit: () => Promise.resolve(last) }) }; },
    }) }) }),
  };
  return { db, calls, filters };
}

describe("the import's calls", () => {
  it("stages: begin, then the rows in batches of 1000, with progress", async () => {
    const { db, calls } = fakeDb({ import_patients_begin: { data: "imp-1" }, import_patients_add_rows: { data: 1000 } });
    const rows = Array.from({ length: 2345 }, (_, i) => ({ row: i + 2, full_name: `P${i}` }));
    const progress: number[] = [];
    expect(await stageImport(db, "iclinic", "patient.csv", rows, (n) => progress.push(n))).toBe("imp-1");
    expect(calls[0]).toEqual({ fn: "import_patients_begin", args: { p_source: "iclinic", p_file_name: "patient.csv" } });
    expect(calls.slice(1).map((c) => (c.args!.p_rows as unknown[]).length)).toEqual([ADD_ROWS_BATCH, ADD_ROWS_BATCH, 345]);
    expect(progress).toEqual([1000, 2000, 2345]);
  });

  it("maps the database's refusals to codes; anything else is generic", async () => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); return "ok"; } catch (e) { return (e as ImportError).code; } };
    let f = fakeDb({ import_patients_begin: { error: { message: "not_allowed" } } });
    expect(await run(() => stageImport(f.db, "generic", "x.csv", []))).toBe("not_allowed");
    f = fakeDb({ import_patients_begin: { data: "imp-1" }, import_patients_add_rows: { error: { message: "too_many_rows" } } });
    expect(await run(() => stageImport(f.db, "generic", "x.csv", [{ row: 2 }]))).toBe("too_many_rows");
    f = fakeDb({ import_patients_commit: { error: { message: "not_validated" } } });
    expect(await run(() => commitImport(f.db, "imp-1"))).toBe("not_validated");
    f = fakeDb({ import_patients_undo: { error: { message: "undo_expired" } } });
    expect(await run(() => undoImport(f.db, "imp-1"))).toBe("undo_expired");
    f = fakeDb({ import_patients_validate: { error: { message: "boom" } } });
    expect(await run(() => validateImport(f.db, "imp-1", "skip"))).toBe("generic");
  });

  it("the error list: rows with an error, a warning or a duplicate, every page", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ row_no: i + 2, outcome: "invalid", warnings: [], errors: ["full_name_missing"], input: {}, duplicate_of_row: null }));
    const f = fakeDb({}, rows);
    expect((await problemRows(f.db, "imp-1")).length).toBe(1500);
    expect(f.filters[0]).toBe("outcome.eq.invalid,outcome.eq.duplicate_in_file,warnings.neq.{}");
  });

  it("the last import of the past 24 h (Desfazer after leaving the page): committed only, newest, with patients created", async () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    const row = { id: "imp-9", source: "iclinic", committed_at: "2026-10-01T02:30:00Z", summary: { created: 12 } };
    let t = fakeDb({}, [], { data: [row], error: null });
    expect(await lastUndoableImport(t.db, now)).toEqual({ id: "imp-9", source: "iclinic", committedAt: row.committed_at, created: 12, until: "2026-10-02T02:30:00.000Z" });
    expect(t.filters).toEqual(["status=committed;committed_at>=2026-09-30T12:00:00.000Z"]);
    t = fakeDb({}, [], { data: [{ ...row, summary: { created: 0 } }], error: null });
    expect(await lastUndoableImport(t.db, now)).toBeNull();
    t = fakeDb({}, [], { data: [], error: null });
    expect(await lastUndoableImport(t.db, now)).toBeNull();
    t = fakeDb({}, [], { data: null, error: { message: "boom" } });
    expect(await lastUndoableImport(t.db, now)).toBeNull();
  });
});
