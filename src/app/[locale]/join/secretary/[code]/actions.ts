"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeSecretaryCode } from "@/lib/secretary";

// Stable codes the page maps through next-intl. The RPCs return these as
// their error message text (migration 088).
const KNOWN_ERRORS = ["invite_invalid", "account_is_patient", "account_is_professional", "already_in_a_clinic", "team_limit_reached"] as const;

function errorCode(message: string | undefined): string {
  return KNOWN_ERRORS.find((c) => message?.includes(c)) ?? "generic";
}

export async function acceptSecretaryInvite(rawCode: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const code = normalizeSecretaryCode(rawCode);
  if (!code) return { ok: false, code: "invite_invalid" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  // Runs with the invitee's own session: the RPC keys on auth.uid() and the
  // account's email, and sets user_roles itself.
  const { error } = await supabase.rpc("accept_secretary_invite", { p_code: code });
  if (error) return { ok: false, code: errorCode(error.message) };
  return { ok: true };
}

export async function declineSecretaryInvite(rawCode: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const code = normalizeSecretaryCode(rawCode);
  if (!code) return { ok: false, code: "invite_invalid" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  const { error } = await supabase.rpc("decline_secretary_invite", { p_code: code });
  if (error) return { ok: false, code: errorCode(error.message) };
  return { ok: true };
}
