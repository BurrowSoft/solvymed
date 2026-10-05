"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeSecretaryCode } from "@/lib/secretary";
import { liveFeatures } from "@/lib/liveFeatures";
import { myPractices } from "@/lib/effectiveProfId";
import { withBrandTitle } from "@/lib/doctorName";

// Stable codes the page maps through next-intl. The RPCs return these as
// their error message text (migration 088).
const KNOWN_ERRORS = ["invite_invalid", "account_is_patient", "account_is_professional", "account_not_secretary", "already_in_a_clinic", "team_limit_reached", "different_country"] as const;

function errorCode(message: string | undefined): string {
  return KNOWN_ERRORS.find((c) => message?.includes(c)) ?? "generic";
}

// ok.doctor: the doctor she just joined, from her practice list (multi-practice
// only; "" when it can't be read), for "{doctor} adicionou você à equipe.".
export async function acceptSecretaryInvite(rawCode: string): Promise<{ ok: true; doctor: string } | { ok: false; code: string }> {
  const code = normalizeSecretaryCode(rawCode);
  if (!code) return { ok: false, code: "invite_invalid" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "generic" };
  // Runs with the invitee's own session: the RPC keys on auth.uid() and the
  // account's email, and sets user_roles itself.
  const { data, error } = await supabase.rpc("accept_secretary_invite", { p_code: code });
  if (error) return { ok: false, code: errorCode(error.message) };
  let doctor = "";
  if (liveFeatures.multiPractice && typeof data === "string") {
    const p = (await myPractices(user.id))?.find((x) => x.professional_id === data);
    doctor = p ? withBrandTitle(p.title, p.display_name) : "";
  }
  return { ok: true, doctor };
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
