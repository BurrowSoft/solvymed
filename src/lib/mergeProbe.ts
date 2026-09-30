import type { SupabaseClient } from "@supabase/supabase-js";

// Whether the database has merge_patients (133) yet: the website may ship
// before the migration is applied, so "Mesclar" stays hidden until it is
// (the app's mergeSupported). A probe with ids that match nothing: a missing
// function answers PGRST202 / "does not exist"; an existing one refuses the
// ids. Only a definitive answer is kept (per server instance): a network
// failure (a throw, or an error with no code) is asked again next time.
let known: boolean | undefined;

export async function mergeSupported(db: SupabaseClient): Promise<boolean> {
  if (known !== undefined) return known;
  try {
    const { error } = await db.rpc("merge_patients_preview", {
      p_a: "00000000-0000-4000-8000-000000000001", p_b: "00000000-0000-4000-8000-000000000002",
    });
    if (error && (error.code === "PGRST202" || /does not exist|could not find/i.test(error.message ?? ""))) return (known = false);
    if (!error || error.code) return (known = true);
    return false;
  } catch {
    return false;
  }
}

/** Tests only. */
export function resetMergeProbe() { known = undefined; }
