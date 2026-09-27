"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// First-run writes (migration 103). Each RPC acts on the caller's own
// account; failures are not user-facing (the card simply stays).

export async function setSetupHidden(hidden: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_setup_hidden", { p_hidden: hidden });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: !error };
}

export async function ackSetupCompleted() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ack_setup_completed");
  revalidatePath("/dashboard");
  return { ok: !error };
}

// Checklist item 6: the doctor (or a secretary) shared or copied the
// invite link. Idempotent.
export async function markInviteShared() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_invite_shared");
  if (!error) revalidatePath("/dashboard");
  return { ok: !error };
}

export async function dismissOnboardingCard(card: "secretary_welcome" | "patient_connected") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_onboarding_card", { p_card: card });
  revalidatePath("/dashboard");
  revalidatePath("/my-appointments");
  return { ok: !error };
}
