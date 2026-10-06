import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The patient-document edge function (190/196), called with the signed-in
// user's session from server actions. Its answer is { ok, ... } or, with a
// 4xx/5xx, { code } (the function's errorCode); a code we can't read is
// "failed".
export async function patientDocumentFn<T>(supabase: SupabaseClient, body: Record<string, unknown>):
  Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const { data, error } = await supabase.functions.invoke("patient-document", { body });
  if (!error) return { ok: true, data: data as T };
  let code = "failed";
  try {
    const ctx = (error as { context?: Response }).context;
    const j = ctx ? await ctx.json() : null;
    if (j && typeof j.code === "string") code = j.code;
  } catch { /* not JSON */ }
  return { ok: false, code };
}
