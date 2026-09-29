"use server";

import { createClient } from "@/lib/supabase/server";
import { savedLocaleFor } from "@/lib/pushRecipient";

// Saves the signed-in user's language for the pushes and messages others
// send them (migration 117, set_my_locale): at sign-in and on every language
// change, like the app. Returns whether it was saved; before 117 (no RPC)
// or for a website-only language, it isn't, and nothing else changes.
export async function saveMyLocale(webLocale: string): Promise<boolean> {
  const locale = savedLocaleFor(webLocale);
  if (!locale) return false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.rpc("set_my_locale", { p_locale: locale });
  return !error;
}
