"use server";

import { createClient } from "@/lib/supabase/server";
import { liveFeatures } from "@/lib/liveFeatures";
import { colleagueError, type ColleagueError, type ColleagueRow } from "@/lib/colleagues";

// "Meus colegas" (167; migration 180): the database decides everything
// (doctor only, an active saved-brand practice by its exact code, the cap,
// the miss limit, the go-live switch); these map its answers. Read as the
// doctor themself (no acting header: a secretary is refused anyway).

export async function listColleagues(): Promise<{ ok: true; rows: ColleagueRow[] } | { ok: false; code: ColleagueError }> {
  if (!liveFeatures.colleagues) return { ok: false, code: "notEnabled" };
  const supabase = await createClient({ acting: false });
  const { data, error } = await supabase.rpc("list_my_colleagues");
  if (error) return { ok: false, code: colleagueError(error.message) };
  return { ok: true, rows: (data ?? []) as ColleagueRow[] };
}

export async function addColleague(code: string): Promise<{ ok: true; row: ColleagueRow } | { ok: false; code: ColleagueError }> {
  if (!liveFeatures.colleagues) return { ok: false, code: "notEnabled" };
  const c = typeof code === "string" ? code.trim().slice(0, 64) : "";
  if (!c) return { ok: false, code: "notFound" };
  const supabase = await createClient({ acting: false });
  const { data, error } = await supabase.rpc("add_my_colleague", { p_code: c });
  if (error) return { ok: false, code: colleagueError(error.message) };
  // No rows = not found (an unknown code, a closed practice, or a doctor who
  // hasn't published My brand): one answer, as the database gives it.
  const row = (Array.isArray(data) ? data[0] : data) as ColleagueRow | undefined;
  return row ? { ok: true, row } : { ok: false, code: "notFound" };
}

export async function removeColleague(colleagueId: string): Promise<{ ok: boolean }> {
  if (!liveFeatures.colleagues || typeof colleagueId !== "string" || !/^[0-9a-f-]{36}$/i.test(colleagueId)) return { ok: false };
  const supabase = await createClient({ acting: false });
  const { error } = await supabase.rpc("remove_my_colleague", { p_colleague_id: colleagueId });
  return { ok: !error };
}
