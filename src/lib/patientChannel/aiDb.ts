import type { SupabaseClient } from "@supabase/supabase-js";
import type { Band, ScoreLine } from "./score";
import type { AiLine } from "./aiRead";

// The M7 migration's RPCs (the mobile developer's contract, specs/patient-channel-m7-contract.md),
// in ONE place: if a name or a parameter changes in review, only this file changes.
// Service role (the requests route): reserve / release / apply / mark. Authenticated, doctor
// only: confirm / undo.

export type AiStatus = "none" | "pending" | "done" | "no_credits" | "failed" | "stale" | "undone";
export const AI_STATUSES: AiStatus[] = ["none", "pending", "done", "no_credits", "failed", "stale", "undone"];
export type ApplyOutcome = "done" | "stale" | "refused";

export async function aiReserve(admin: SupabaseClient, requestId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("pc_ai_reserve", { p_request_id: requestId });
  if (error) throw error;
  return (data as { allowed?: unknown } | null)?.allowed === true;
}

export async function aiRelease(admin: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await admin.rpc("pc_ai_release", { p_request_id: requestId });
  if (error) throw error;
}

export async function aiApply(
  admin: SupabaseClient,
  p: { requestId: string; rulesVersion: number; aiLines: AiLine[]; total: number; band: Band; lines: ScoreLine[]; inputTokens: number; outputTokens: number },
): Promise<ApplyOutcome> {
  const { data, error } = await admin.rpc("pc_ai_apply", {
    p_request_id: p.requestId,
    p_rules_version: p.rulesVersion,
    p_ai_lines: p.aiLines,
    p_total: p.total,
    p_band: p.band,
    p_lines: p.lines,
    p_input_tokens: p.inputTokens,
    p_output_tokens: p.outputTokens,
  });
  if (error) throw error;
  return data === "done" || data === "stale" ? data : "refused";
}

// From 'none' only (no credit was taken): no AI key on this deployment.
export async function aiMark(admin: SupabaseClient, requestId: string, status: "no_credits" | "failed"): Promise<void> {
  const { error } = await admin.rpc("pc_ai_mark", { p_request_id: requestId, p_status: status });
  if (error) throw error;
}

// The doctor's "Leitura por IA" switch (ai_mapping isn't in the doctor's column grant). Raises
// P0001 'ai_not_available' outside the testers phase's allowlist, 42501 for a secretary.
export async function aiSetMapping(db: SupabaseClient, on: boolean): Promise<boolean> {
  const { data, error } = await db.rpc("pc_set_ai_mapping", { p_on: on });
  if (error) throw error;
  return data === true;
}

// The doctor's Confirmar / Desfazer (as the doctor: a secretary, another practice or an unknown
// id raise 42501 'forbidden').
export async function aiConfirm(db: SupabaseClient, requestId: string): Promise<boolean> {
  const { data, error } = await db.rpc("pc_ai_confirm", { p_request_id: requestId });
  if (error) throw error;
  return data === true;
}

export async function aiUndo(db: SupabaseClient, requestId: string): Promise<boolean> {
  const { data, error } = await db.rpc("pc_ai_undo", { p_request_id: requestId });
  if (error) throw error;
  return data === true;
}
