// The patient import's calls (migrations 130 staging + validation, 131
// commit + undo), as the signed-in doctor (a secretary gets not_allowed).
// Rows go to the database's own staging table in batches; nothing is saved
// as a patient until import_patients_commit. The client is passed in so the
// steps can be tested with a fake.
import type { ImportRow, ImportSource } from "./plan";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
export type ImportDb = {
  rpc: Rpc;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: unknown) => {
        or: (f: string) => { order: (col: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> } };
        order: (col: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> };
        gte: (col: string, v: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
};

export const ADD_ROWS_BATCH = 1000; // 130's cap per call

export type ImportErrorCode =
  | "not_allowed" | "too_many_rows" | "import_closed" | "not_validated" | "not_committed" | "undo_expired" | "invalid" | "generic";
export class ImportError extends Error {
  constructor(public code: ImportErrorCode) { super(code); }
}
const KNOWN: ImportErrorCode[] = ["not_allowed", "too_many_rows", "import_closed", "not_validated", "not_committed", "undo_expired", "invalid"];
function fail(e: { message?: string } | null): never {
  const m = e?.message ?? "";
  throw new ImportError(KNOWN.find((k) => m.includes(k)) ?? "generic");
}

// begin (it deletes the doctor's other unfinished import) + the rows in
// batches; onProgress gets the rows sent so far.
export async function stageImport(db: ImportDb, source: ImportSource, fileName: string, rows: ImportRow[], onProgress?: (sent: number) => void): Promise<string> {
  const begin = await db.rpc("import_patients_begin", { p_source: source, p_file_name: fileName.slice(0, 200) });
  if (begin.error || typeof begin.data !== "string") fail(begin.error);
  const id = begin.data as string;
  for (let i = 0; i < rows.length; i += ADD_ROWS_BATCH) {
    const batch = rows.slice(i, i + ADD_ROWS_BATCH);
    const r = await db.rpc("import_patients_add_rows", { p_import_id: id, p_rows: batch });
    if (r.error) fail(r.error);
    onProgress?.(Math.min(i + ADD_ROWS_BATCH, rows.length));
  }
  return id;
}

export type ValidateSummary = { total: number; new: number; existing: number; duplicate_in_file: number; invalid: number; with_warnings: number; existing_to_fill: number; archived?: number;
  // 130: CPFs that lost their leading zero (Excel) and were completed.
  cpf_zero_padded?: number;
  // 139: 7-digit CEPs completed (BR).
  cep_zero_padded?: number };
export async function validateImport(db: ImportDb, id: string, onExisting: "skip" | "fill_empty"): Promise<ValidateSummary> {
  const r = await db.rpc("import_patients_validate", { p_import_id: id, p_on_existing: onExisting });
  if (r.error || !r.data || typeof r.data !== "object") fail(r.error);
  return r.data as ValidateSummary;
}

export type PreviewRow = {
  row_no: number; outcome: "new" | "existing" | "duplicate_in_file" | "invalid" | null;
  duplicate_of_row: number | null; warnings: string[]; errors: string[]; input: Record<string, unknown>;
};
const PREVIEW_COLS = "row_no, outcome, duplicate_of_row, warnings, errors, input";

// One page of the staged rows (for the preview table).
export async function previewRows(db: ImportDb, id: string, from = 0, to = 49): Promise<PreviewRow[]> {
  const r = await db.from("patient_import_rows").select(PREVIEW_COLS).eq("import_id", id).order("row_no").range(from, to);
  if (r.error) throw new ImportError("generic");
  return (r.data ?? []) as PreviewRow[];
}

// Every row with something to say (an error, a warning, or a duplicate in
// the file), for the error list the doctor downloads.
export async function problemRows(db: ImportDb, id: string): Promise<PreviewRow[]> {
  const out: PreviewRow[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await db.from("patient_import_rows").select(PREVIEW_COLS).eq("import_id", id)
      .or("outcome.eq.invalid,outcome.eq.duplicate_in_file,warnings.neq.{}").order("row_no").range(from, from + 999);
    if (r.error) throw new ImportError("generic");
    const page = (r.data ?? []) as PreviewRow[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export type CommitSummary = {
  total: number; created: number; filled: number; existing_skipped: number; duplicate_in_file: number;
  invalid: number; conflicts: number; archived?: number; filled_patients?: { row: number; patient_id: string; fields: string[] }[];
};
export async function commitImport(db: ImportDb, id: string): Promise<CommitSummary> {
  const r = await db.rpc("import_patients_commit", { p_import_id: id });
  if (r.error || !r.data || typeof r.data !== "object") fail(r.error);
  return r.data as CommitSummary;
}

export async function undoImport(db: ImportDb, id: string): Promise<{ deleted: number; kept: number }> {
  const r = await db.rpc("import_patients_undo", { p_import_id: id });
  if (r.error || !r.data || typeof r.data !== "object") fail(r.error);
  return r.data as { deleted: number; kept: number };
}

// "Última importação" (UX): the doctor's latest import committed in the
// last 24 hours, so Desfazer stays reachable after leaving the page (131
// allows the undo for 24 h). RLS: the doctor's own imports only. Null when
// there's none or it can't be read (the card just doesn't show).
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
export type LastImport = { id: string; source: string; committedAt: string; created: number; until: string };
export async function lastUndoableImport(db: ImportDb, now = Date.now()): Promise<LastImport | null> {
  try {
    const since = new Date(now - UNDO_WINDOW_MS).toISOString();
    const r = await db.from("patient_imports").select("id, source, committed_at, summary")
      .eq("status", "committed").gte("committed_at", since).order("committed_at", { ascending: false }).limit(1);
    const row = (Array.isArray(r.data) ? r.data[0] : null) as { id: string; source: string; committed_at: string; summary: { created?: number } | null } | undefined;
    if (r.error || !row?.committed_at) return null;
    const created = Number(row.summary?.created ?? 0);
    // Nothing new to remove: no card.
    if (!(created > 0)) return null;
    return { id: row.id, source: row.source, committedAt: row.committed_at, created, until: new Date(new Date(row.committed_at).getTime() + UNDO_WINDOW_MS).toISOString() };
  } catch {
    return null;
  }
}

// Cancelar importação: the staged rows are deleted (130 also purges an
// unfinished import after 24 h). Best effort: a failure changes nothing
// for the doctor, since nothing was saved as a patient.
export async function discardImport(db: ImportDb, id: string): Promise<void> {
  await db.rpc("import_patients_discard", { p_import_id: id });
}
