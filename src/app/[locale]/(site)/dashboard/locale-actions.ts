"use server";

import { createClient } from "@/lib/supabase/server";
import { savedLocaleFor } from "@/lib/pushRecipient";

// Saves the signed-in user's language for the pushes and messages others
// send them (migration 117, set_my_locale): at sign-in and on every language
// change, like the app. Returns whether it was saved; before 117 (no RPC)
// or for a website-only language, it isn't, and nothing else changes.
// country (patients, 149): BR or TH, saved with it; anything else is left out
// (the saved one stays).
export async function saveMyLocale(webLocale: string, country?: string | null): Promise<boolean> {
  const locale = savedLocaleFor(webLocale);
  if (!locale) return false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const c = country === "BR" || country === "TH" ? country : null;
  const { error } = await supabase.rpc("set_my_locale", c ? { p_locale: locale, p_country: c } : { p_locale: locale });
  return !error;
}
