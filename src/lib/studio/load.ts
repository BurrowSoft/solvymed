import { studioEnabled } from "./live";
import { DOC_TYPES, validateDesign, type Design, type DocType } from "./design";
import { resolveStyle, type DocStyle, type LegacyStyle } from "./resolve";

// Reading the practice's design for a document (Document Studio PR2, the
// plumbing): c5's get_practice_design() (contract 10-12: the owner and
// their secretaries read; one row with the design, its version and whether
// it was saved). Until Studio is live, or when there's no design, it isn't
// saved, it can't be read or it doesn't validate, a document is drawn
// exactly as today.

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> };

export type PracticeDesign = { design: Design; saved: boolean; version: number };

export async function loadPracticeDesign(supabase: Rpc): Promise<PracticeDesign | null> {
  try {
    const { data, error } = await supabase.rpc("get_practice_design");
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row || !validateDesign(row.design).ok) return null;
    return { design: row.design as Design, saved: row.saved === true, version: Number(row.version ?? 0) };
  } catch {
    return null;
  }
}

// A document type a design styles; the legal layouts (the BR controlled
// prescription, the Thai receipt) and anything else: none.
export function designDocType(t: string | null | undefined): DocType | null {
  return t && (DOC_TYPES as readonly string[]).includes(t) ? (t as DocType) : null;
}

const legacyStyle = (legacy: LegacyStyle): DocStyle => resolveStyle(null, false, legacy, "prescription");

// The style a document is drawn with. `type` is asked only when a saved
// design exists (a medical document's type is one more read).
export async function documentStyle(supabase: Rpc, legacy: LegacyStyle, type: () => Promise<DocType | null> | DocType | null): Promise<DocStyle> {
  if (!(await studioEnabled(supabase))) return legacyStyle(legacy);
  const d = await loadPracticeDesign(supabase);
  if (!d?.saved) return legacyStyle(legacy);
  const t = await type();
  return t ? resolveStyle(d.design, true, legacy, t) : legacyStyle(legacy);
}
