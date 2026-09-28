import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { normalizeCountry } from "./country";

type Db = Pick<SupabaseClient, "from" | "rpc">;

// The practice's country (professionals.country, migration 110). The doctor
// reads their own row; a secretary can't (RLS) and gets it from
// get_my_clinic().
//
// Before 110 is applied the column doesn't exist (PostgREST 42703) or the
// RPC has no `country` field: every practice was Brazilian then, so that's
// 'BR'. Any OTHER failure (network, RLS, timeout) is unknown, not Brazil.
export type CountryLookup = { ok: true; country: string } | { ok: false; code: string };

export async function lookupPracticeCountry(db: Db, userId: string, effectiveProfId: string): Promise<CountryLookup> {
  try {
    if (userId === effectiveProfId) {
      const { data, error } = await db.from("professionals").select("country").eq("id", userId).maybeSingle();
      if (error) return error.code === "42703" ? { ok: true, country: "BR" } : { ok: false, code: error.code ?? "unknown" };
      const country = (data as { country?: unknown } | null)?.country;
      if (!data) return { ok: false, code: "no_row" };
      return { ok: true, country: typeof country === "string" ? normalizeCountry(country) : "BR" };
    }
    const { data, error } = await db.rpc("get_my_clinic");
    if (error) return { ok: false, code: error.code ?? "unknown" };
    const row = (Array.isArray(data) ? data[0] : data) as { country?: unknown } | null;
    if (!row) return { ok: false, code: "no_row" };
    return { ok: true, country: typeof row.country === "string" ? normalizeCountry(row.country) : "BR" };
  } catch {
    return { ok: false, code: "exception" };
  }
}

// For DISPLAY (amount formatting): an unknown country shows BRL rather than
// breaking the page, and the failure is reported (ids/codes only).
export async function getPracticeCountry(db: Db, userId: string, effectiveProfId: string): Promise<string> {
  const r = await lookupPracticeCountry(db, userId, effectiveProfId);
  if (r.ok) return r.country;
  Sentry.captureMessage("practice_country_lookup_failed", { level: "warning", tags: { code: r.code } });
  return "BR";
}
