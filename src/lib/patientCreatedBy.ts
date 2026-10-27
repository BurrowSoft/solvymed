import type { SupabaseClient } from "@supabase/supabase-js";

// Who added a patient record (launch polish 42): decided by the server
// (patient_created_by_kind, the mobile developer's RPC), since a secretary
// can't read patient_connections. 'self' = the patient joined with the
// doctor's code and created the record themselves; 'unknown' = the creator's
// account is gone (created_by set to null). The server's precedence: doctor,
// self, secretary, other.
export type CreatedByKind = "self" | "secretary" | "other" | "doctor" | "unknown";

const KINDS: readonly string[] = ["self", "secretary", "other", "doctor", "unknown"];

export function toCreatedByKind(v: unknown): CreatedByKind | null {
  return typeof v === "string" && KINDS.includes(v) ? (v as CreatedByKind) : null;
}

// Null before the RPC is live or on any error (42501 out of scope): the page then
// shows the role-free line, never "(secretaria)" by guess.
export async function readCreatedByKind(supabase: SupabaseClient, patientId: string): Promise<CreatedByKind | null> {
  try {
    const { data, error } = await supabase.rpc("patient_created_by_kind", { p_patient: patientId });
    return error ? null : toCreatedByKind(data);
  } catch {
    return null;
  }
}

// Which "Adicionado por" line shows: none when the doctor added the record or
// the creator is unknown (no created_by).
export function addedByLine(
  kind: CreatedByKind | null | undefined,
  p: { created_by?: string | null; professional_id?: string; created_by_name?: string | null },
): "self" | "secretary" | "other" | null {
  if (!p.created_by || p.created_by === p.professional_id || kind === "doctor" || kind === "unknown") return null;
  if (kind === "self") return "self";
  if (!p.created_by_name) return null;
  return kind === "secretary" ? "secretary" : "other";
}
