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

// Secretary invite email (migration 151, send-secretary-invite): { code }
// right after create_secretary_invite, or { resend_email } for "Reenviar
// convite" (a fresh 7-day invite; the old code stops working). Only called
// while secretary-invite-email-live is met (the privacy text first).
export type InviteEmailResult =
  | { ok: true; email: string; code: string; nextAt: string | null }
  | { ok: false; code: string; nextAt: string | null };

export async function sendSecretaryInviteEmail(body: { code: string } | { resend_email: string }): Promise<InviteEmailResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session) return { ok: false, code: "unauthorized", nextAt: null };
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-secretary-invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { email?: string; code?: string; next_at?: string | null };
    if (res.ok) {
      revalidatePath("/dashboard/settings");
      return { ok: true, email: json.email ?? "", code: json.code ?? "", nextAt: json.next_at ?? null };
    }
    return { ok: false, code: typeof json.code === "string" ? json.code : "send_failed", nextAt: json.next_at ?? null };
  } catch {
    return { ok: false, code: "send_failed", nextAt: null };
  }
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
