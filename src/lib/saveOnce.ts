import { isUuid } from "@/lib/patientFiles";

// Saving once (specs/offline-guard.md §5 "ghost save", migration 216; the
// app's lib/save-once.ts). A form keeps one id from when it opens until a
// confirmed save, and sends it with every try. If the network dropped
// after the server saved, the retry finds the row instead of making a
// second one:
// - direct inserts (records, documents) use it as the row's id: a repeat is
//   a duplicate key (23505; appointments can also give 23P01), and the row
//   is read back by id; seen = it was saved;
// - the RPCs (create_prescription, the corrections) take it as p_id and
//   return the existing row on a repeat; an id that belongs to something
//   else raises id_conflict (the form then takes a new id).

// The form's id, or null when it sent none (an older open page).
export function clientIdFrom(v: unknown): string | null {
  return isUuid(v) ? v : null;
}

// A repeat of a save that already happened.
export function isDuplicateKey(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505" || error?.code === "23P01";
}

// After a duplicate key: was it this doctor's own row (saved before)? A
// select under the caller's RLS; an error or nothing seen = a real failure.
export async function savedBefore(read: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<boolean> {
  try {
    const { data, error } = await read();
    return !error && !!data;
  } catch {
    return false;
  }
}

// ── A retry after the doctor CHANGED the form (02 "(c) everywhere", c5's
// rule, the same in the app): the first try was saved, the answer lost, and
// the form edited before trying again. Never overwrite the saved version
// silently, never drop the edit silently: compare what was stored with what
// this try sent, on the form's key fields; different → the action says so
// (alreadySavedChanged) and the page shows the STORED version with a
// message; the doctor then uses Edit (within 24 h) or a correction.

// The try number the form sends with its id (1 = the first).
export function isRetry(v: unknown): boolean {
  return Number(v) > 1;
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
// Key order and missing-vs-null don't matter; values compare trimmed.
function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort()
      .filter((k) => (v as Record<string, unknown>)[k] != null && (v as Record<string, unknown>)[k] !== "")
      .map((k) => [k, norm((v as Record<string, unknown>)[k])]));
  }
  return typeof v === "string" ? v.trim() : v;
}
const sameJson = (a: unknown, b: unknown) => JSON.stringify(norm(a ?? null)) === JSON.stringify(norm(b ?? null));

export function sameRecord(stored: { content?: unknown; sections?: unknown; correction_reason?: unknown }, sent: { content: string; sections?: unknown; reason?: string | null }): boolean {
  return txt(stored.content) === txt(sent.content) && sameJson(stored.sections, sent.sections) && txt(stored.correction_reason) === txt(sent.reason);
}

type Item = { name?: unknown; dosage?: unknown; frequency?: unknown; duration?: unknown };
export function samePrescription(stored: { notes?: unknown; prescription_items?: Item[] | null; correction_reason?: unknown }, sent: { notes: string | null; items: Item[]; reason?: string | null }): boolean {
  // The items as a list (the stored order isn't guaranteed: compared sorted).
  const key = (it: Item) => [it.name, it.dosage, it.frequency, it.duration].map(txt).join("\u0000");
  const a = (stored.prescription_items ?? []).map(key).sort();
  const b = sent.items.map(key).sort();
  return txt(stored.notes) === txt(sent.notes) && a.length === b.length && a.every((x, i) => x === b[i]) && txt(stored.correction_reason) === txt(sent.reason);
}

export function sameDocument(stored: { body?: unknown; fields?: unknown; correction_reason?: unknown }, sent: { body: string | null; fields: unknown; reason?: string | null }): boolean {
  return txt(stored.body) === txt(sent.body) && sameJson(stored.fields, sent.fields) && txt(stored.correction_reason) === txt(sent.reason);
}
