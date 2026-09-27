import type { SupabaseClient } from "@supabase/supabase-js";

// First-run (migration 103). The state is derived server-side, identical on
// web and mobile.
export type SetupProgress = {
  profile_done: boolean;
  hours_done: boolean;
  procedure_done: boolean;
  patient_done: boolean;
  appointment_done: boolean;
  invite_shared: boolean;
  setup_hidden: boolean;
  completed_ack: boolean;
  done_count: number;
};

export type OnboardingFlags = {
  secretary_welcome_seen: boolean;
  patient_connected_seen: boolean;
  clinic_professional_id: string | null;
  clinic_name: string | null;
};

function firstRow<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) as T | undefined) ?? null;
}

// The doctor's checklist state, or null when it can't load (a secretary or
// patient caller, a network error, or before migration 103): no card then.
export async function getSetupProgress(supabase: unknown): Promise<SetupProgress | null> {
  const { data, error } = await (supabase as SupabaseClient).rpc("get_setup_progress");
  return error ? null : firstRow<SetupProgress>(data);
}

// The one-time cards' flags, or null when they can't load (no card then).
export async function getOnboardingFlags(supabase: unknown): Promise<OnboardingFlags | null> {
  const { data, error } = await (supabase as SupabaseClient).rpc("get_onboarding_flags");
  return error ? null : firstRow<OnboardingFlags>(data);
}

// Whether the checklist card shows on Home.
export function showChecklist(p: SetupProgress | null): p is SetupProgress {
  return !!p && !p.setup_hidden && !p.completed_ack;
}
