"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Secretary team management (migration 088 RPCs). The RPCs enforce every
// rule (doctor-only, email-bound single-use invites, the 3-person limit);
// these actions only map their error text to stable codes for next-intl.
const KNOWN = [
  "only professionals can invite secretaries",
  "invalid_email",
  "cannot_invite_self",
  "team_limit_reached",
  "could_not_generate_code",
  "invite_not_found",
  "secretary_not_found",
  "not_in_a_clinic",
] as const;

function code(message: string | undefined): string {
  const hit = KNOWN.find((k) => message?.includes(k));
  if (!hit) return "generic";
  return hit === "only professionals can invite secretaries" ? "not_professional" : hit;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string };

// Creating an invite for an email that already has one replaces it
// ("Resend"): the old code stops working and a new one is shown once.
export async function createSecretaryInvite(email: string): Promise<Result<{ code: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  const { data, error } = await supabase.rpc("create_secretary_invite", { p_email: email.trim().toLowerCase() });
  if (error || typeof data !== "string") return { ok: false, code: code(error?.message) };
  revalidatePath("/dashboard/settings");
  return { ok: true, code: data };
}

export async function revokeSecretaryInvite(inviteId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  const { error } = await supabase.rpc("revoke_secretary_invite", { p_invite_id: inviteId });
  if (error) return { ok: false, code: code(error.message) };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function removeSecretary(secretaryUserId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  const { error } = await supabase.rpc("remove_secretary", { p_secretary_user_id: secretaryUserId });
  if (error) return { ok: false, code: code(error.message) };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function leaveClinic(): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  const { error } = await supabase.rpc("leave_clinic");
  if (error) return { ok: false, code: code(error.message) };
  return { ok: true };
}
