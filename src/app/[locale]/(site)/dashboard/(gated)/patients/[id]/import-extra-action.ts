"use server";

import { createClient } from "@/lib/supabase/server";

// "Dados importados" (migration 131; the app's ImportedData): the columns an
// import brought that SolvyMed has no field for. Old exports often put
// clinical data there, so it is the DOCTOR's only: get_patient_import_extra
// refuses anyone else (not_allowed) and logs the opening in the patient's
// Access tab ("Abriu os dados importados", once a minute). Read on every
// opening, never cached or kept on the page.
export type ImportExtra = { data: Record<string, string> | null; source: string | null; importedAt: string | null };

export async function getImportExtra(patientId: string): Promise<ImportExtra | null> {
  if (typeof patientId !== "string" || !/^[0-9a-f-]{36}$/i.test(patientId)) return null;
  const supabase = await createClient({ acting: false });
  const { data, error } = await supabase.rpc("get_patient_import_extra", { p_patient_id: patientId });
  if (error) return null;
  const r = (data ?? {}) as Record<string, unknown>;
  const raw = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : null;
  const rows = raw ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? "" : String(v)])) : null;
  return {
    data: rows && Object.keys(rows).length ? rows : null,
    source: typeof r.source === "string" ? r.source : null,
    importedAt: typeof r.imported_at === "string" ? r.imported_at : null,
  };
}
