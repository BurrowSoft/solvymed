"use server";

import { createClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/legalVersions";
import { routing } from "@/i18n/routing";

// "OK" on the privacy notice: records this build's version for the caller
// (migration 204's record_privacy_consent). A newer one already stored
// ('older_version') counts as done; 'unknown_version' (the accepting
// migration isn't live) or any other failure keeps the card.
export async function acknowledgePrivacyNotice(locale: string): Promise<{ ok: boolean }> {
  const lang = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  try {
    const supabase = await createClient({ acting: false });
    const { error } = await supabase.rpc("record_privacy_consent", {
      p_document: "privacy",
      p_version: PRIVACY_VERSION,
      p_platform: "web",
      p_locale: lang,
    });
    if (!error) return { ok: true };
    return { ok: /older_version/.test(error.message ?? "") };
  } catch {
    return { ok: false };
  }
}
