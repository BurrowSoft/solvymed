import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicFlag } from "@/lib/publicFlags";

// Whether the Patient Channel works for this caller (specs/patient-contact-tech.md §9;
// migration 237's _pc_on_for): the public switch `patient_channel` (get_public_flags), OR
// the caller is on the testers' allowlist (patient_channel_testers: run-created test
// accounts, per USER). The allowlist is read here on the server with the service role and
// never reaches a client. Off for a caller = the routes 404 and the entries stay hidden.
// The server is the gate: every 237 RPC checks _pc_on_for again. The Help and the App Map
// follow the patient-channel-live condition.

type Rpc = { rpc(fn: "get_public_flags"): PromiseLike<{ data: unknown; error: unknown }> };

export const PATIENT_CHANNEL_FLAG = "patient_channel";

// On the testers' allowlist (237). Server only: the service role key never leaves it.
export async function isPatientChannelTester(userId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !userId) return false;
  try {
    const admin = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from("patient_channel_testers").select("user_id").eq("user_id", userId).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export async function patientChannelEnabled(
  supabase: Rpc,
  userId: string | null | undefined,
  isTester: (id: string) => Promise<boolean> = isPatientChannelTester,
): Promise<boolean> {
  if (await publicFlag(supabase, PATIENT_CHANNEL_FLAG)) return true;
  return !!userId && (await isTester(userId));
}

// Previews only (never Production): ?pc_test=1 opens the screens for the testers' rows
// on sample data where there's no real practice data yet (M4a), as the demo's ?demo_test=1.
export function patientChannelPreviewTest(param: string | string[] | undefined): boolean {
  return process.env.VERCEL_ENV !== "production" && param === "1";
}

// The inbox (M5) for a practice's staff: on with the public switch, or when the caller or
// the practice's doctor is on the testers' allowlist (a secretary isn't on it herself; she
// works for an allowlisted doctor).
export async function patientChannelOnForPractice(
  supabase: Rpc,
  userId: string,
  profId: string,
  isTester: (id: string) => Promise<boolean> = isPatientChannelTester,
): Promise<boolean> {
  if (await patientChannelEnabled(supabase, userId, isTester)) return true;
  return profId !== userId && (await isTester(profId));
}
