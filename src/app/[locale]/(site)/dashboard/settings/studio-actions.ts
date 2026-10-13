"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { studioEnabled } from "@/lib/studio/live";
import { validateDesign, type Design } from "@/lib/studio/design";

// Document Studio PR3: saving the doctor's own design (migrations 221/222)
// through save_my_design with the version the editor was opened at: a stale
// one is refused ("conflict"), never overwritten. Doctor only (the RPC
// refuses secretaries too); nothing while the document_studio flag is off.

export type SaveDesignResult = { ok: true; version: number } | { ok: false; code: "conflict" | "invalid" | "not_allowed" | "generic" };

export async function saveMyDesign(design: Design, expectedVersion: number): Promise<SaveDesignResult> {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { ok: false, code: "invalid" };
  if (!validateDesign(design).ok) return { ok: false, code: "invalid" };
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await isProfessionalRole(supabase, user.id)) !== true) return { ok: false, code: "not_allowed" };
  if (!(await studioEnabled(supabase))) return { ok: false, code: "not_allowed" };
  const { data, error } = await supabase.rpc("save_my_design", { p_design: design, p_expected_version: expectedVersion });
  if (error) {
    const e = error as { message?: string; code?: string };
    const m = `${e.message ?? ""} ${e.code ?? ""}`;
    if (e.code === "40001" || m.includes("conflict")) return { ok: false, code: "conflict" };
    if (m.includes("invalid_design")) return { ok: false, code: "invalid" };
    if (e.code === "42501" || m.includes("not_allowed")) return { ok: false, code: "not_allowed" };
    return { ok: false, code: "generic" };
  }
  const version = Number(data);
  revalidatePath("/dashboard/settings/studio");
  return { ok: true, version: Number.isInteger(version) && version > expectedVersion ? version : expectedVersion + 1 };
}
