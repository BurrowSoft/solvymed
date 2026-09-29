import type { SupabaseClient } from "@supabase/supabase-js";
import { practiceFallbackLocale, pushLocale, type PushLocale } from "./pushText";

// Who a push goes to and in which language: each device in its READER's
// saved language, else the practice's (pt-BR for Brazil, th for Thailand,
// en otherwise; UX 2026-09-29).
//
// Migration 117 gives it per token (get_patient_push_targets /
// get_clinic_push_targets, from what both clients save with set_my_locale).
// Until 117 is applied those RPCs don't exist: the older path runs (the
// tokens, then patient_profiles.locale or the practice's language). Every
// read fails soft: a push is never blocked by it.

export type PushTarget = { locale: PushLocale; tokens: string[] };

function group(rows: { token: string; locale: string | null }[], fallback: PushLocale): PushTarget[] {
  const by = new Map<PushLocale, string[]>();
  for (const r of rows) {
    if (!r.token) continue;
    const l = pushLocale(r.locale) ?? fallback;
    by.set(l, [...(by.get(l) ?? []), r.token]);
  }
  return [...by].map(([locale, tokens]) => ({ locale, tokens }));
}

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

// The clinic's language before 117: the practice's. professionals.locale
// (047) is NOT NULL DEFAULT 'pt-BR' and nothing wrote it, so it can't tell a
// Thai doctor from a Brazilian one (a9).
export async function professionalPushLocale(db: SupabaseClient, professionalId: string): Promise<PushLocale> {
  return practiceLocale(db, professionalId);
}

// A patient's devices, each in its reader's language.
export async function patientPushTargets(db: SupabaseClient, patientAuthId: string, professionalId: string): Promise<PushTarget[]> {
  try {
    const { data, error } = await db.rpc("get_patient_push_targets", { p_patient_auth_id: patientAuthId });
    const rows = (data ?? []) as { token: string; locale: string | null }[];
    // 117's targets need a booking linked to this account; otherwise (or
    // before 117) the tokens RPC below still reaches a linked patient.
    if (!error && rows.length) return group(rows, await practiceLocale(db, professionalId));
  } catch {
    // Before 117.
  }
  try {
    const { data } = await db.rpc("get_patient_push_tokens", { p_patient_auth_id: patientAuthId });
    const tokens = ((data ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean);
    if (!tokens.length) return [];
    return [{ locale: await patientPushLocale(db, patientAuthId, professionalId), tokens }];
  } catch {
    return [];
  }
}

// The practice's devices (the doctor and their secretaries), each in its
// reader's language.
export async function clinicPushTargets(db: SupabaseClient, professionalId: string): Promise<PushTarget[]> {
  try {
    const { data, error } = await db.rpc("get_clinic_push_targets", { p_professional_id: professionalId });
    if (!error) return group((data ?? []) as { token: string; locale: string | null }[], await practiceLocale(db, professionalId));
  } catch {
    // Before 117.
  }
  try {
    const { data } = await db.rpc("get_clinic_push_tokens", { p_professional_id: professionalId });
    const tokens = ((data ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean);
    if (!tokens.length) return [];
    return [{ locale: await professionalPushLocale(db, professionalId), tokens }];
  } catch {
    return [];
  }
}

// The website's 15 locales → what set_my_locale (117) stores. The website
// has languages the app doesn't; those aren't saved, so they never replace
// the language someone chose in the app.
const SAVED: Record<string, string> = { "pt-BR": "pt-BR", en: "en", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES", th: "th" };
export function savedLocaleFor(webLocale: string): string | null {
  return SAVED[webLocale] ?? null;
}
