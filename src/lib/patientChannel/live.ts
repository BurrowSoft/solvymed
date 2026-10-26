// Whether the Patient Channel works for this caller (specs/patient-contact-tech.md §9):
// the server flag `patient_channel` (get_server_flags, with its testers), the ONE switch
// both platforms read, as Document Studio's (lib/studio/live). Before migration 237
// there is no row: off. Off for a caller = the routes 404 and the entries stay hidden.
// The Help and the App Map follow the patient-channel-live condition.

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> };

export const PATIENT_CHANNEL_FLAG = "patient_channel";

export async function patientChannelEnabled(supabase: Rpc): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("get_server_flags");
    if (error) return false;
    return ((data ?? []) as { key?: string; enabled?: boolean }[]).some((f) => f.key === PATIENT_CHANNEL_FLAG && f.enabled === true);
  } catch {
    return false;
  }
}

// Previews only (never Production): ?pc_test=1 opens the screens for the testers'
// rows before the flag exists, as the demo's ?demo_test=1. Nothing saves yet (M3a).
export function patientChannelPreviewTest(param: string | string[] | undefined): boolean {
  return process.env.VERCEL_ENV !== "production" && param === "1";
}
