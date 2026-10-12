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
