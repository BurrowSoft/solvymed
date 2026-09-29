import type { SupabaseClient } from "@supabase/supabase-js";
import { practiceFallbackLocale, pushLocale, type PushLocale } from "./pushText";

// The language a push is written in: the RECIPIENT's saved one, else the
// practice's (pt-BR for Brazil, th for Thailand, en otherwise; UX
// 2026-09-29). The one place to switch to the saved-language RPC the mobile
// dev is adding; every read here fails soft (a push is never blocked by it).

async function practiceLocale(db: SupabaseClient, professionalId: string): Promise<PushLocale> {
  try {
    const { data } = await db.rpc("get_professional_public_info", { p_professional_id: professionalId });
    const row = (Array.isArray(data) ? data[0] : data) as { country?: string | null } | null;
    return practiceFallbackLocale(row?.country ?? null);
  } catch {
    return practiceFallbackLocale(null);
  }
}

export async function patientPushLocale(db: SupabaseClient, patientAuthId: string, professionalId: string): Promise<PushLocale> {
  try {
    const { data } = await db.from("patient_profiles").select("locale").eq("user_id", patientAuthId).maybeSingle();
    const saved = pushLocale((data as { locale?: string | null } | null)?.locale);
    if (saved) return saved;
  } catch {
    // Unreadable here: the practice's language.
  }
  return practiceLocale(db, professionalId);
}

// The clinic's pushes: the practice's language for now. professionals.locale
// (047) is NOT NULL DEFAULT 'pt-BR' and nothing writes it, so it can't tell a
// Thai doctor from a Brazilian one (a9). The saved-language RPC replaces
// this once it records a real value.
export async function professionalPushLocale(db: SupabaseClient, professionalId: string): Promise<PushLocale> {
  return practiceLocale(db, professionalId);
}
