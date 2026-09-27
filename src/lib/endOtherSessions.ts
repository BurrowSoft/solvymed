import type { SupabaseClient } from "@supabase/supabase-js";

// After a password reset or change, every OTHER session ends (other
// browsers, the app, other devices); this browser stays signed in (UX
// decision). Best-effort: the new password is already saved.
export async function endOtherSessions(supabase: Pick<SupabaseClient, "auth">) {
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch {
    // Nothing to show the user; the password change itself succeeded.
  }
}
