// Whether Document Studio works for this caller: the server flag
// `document_studio` (get_server_flags, with per-practice testers), the ONE
// switch both platforms read (02, 10-13). Tester practices get it before
// launch; launch turns the flag on. The Help (C17) and the App Map follow
// the document-studio-live condition, flipped in the same window.
// No flag, no row, or a failed read: off (documents look as today).

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> };

export const STUDIO_FLAG = "document_studio";

export async function studioEnabled(supabase: Rpc): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("get_server_flags");
    if (error) return false;
    return ((data ?? []) as { key?: string; enabled?: boolean }[]).some((f) => f.key === STUDIO_FLAG && f.enabled === true);
  } catch {
    return false;
  }
}
