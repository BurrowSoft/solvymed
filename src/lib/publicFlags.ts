// Server switches that signed-out pages may read (migration 229,
// get_public_flags: rows { key, enabled }, callable as anon). Shared with
// the app, so both flip together. Anything uncertain is OFF: a missing key,
// an error, or the function not deployed yet (PGRST202).
type FlagReader = { rpc: (fn: "get_public_flags") => PromiseLike<{ data: unknown; error: unknown }> };

export type PublicFlag = "confirm_by_code";

export async function publicFlag(supabase: unknown, key: PublicFlag): Promise<boolean> {
  try {
    const { data, error } = await (supabase as FlagReader).rpc("get_public_flags");
    if (error || !Array.isArray(data)) return false;
    return data.some((r) => (r as { key?: unknown; enabled?: unknown })?.key === key && (r as { enabled?: unknown }).enabled === true);
  } catch {
    return false;
  }
}
