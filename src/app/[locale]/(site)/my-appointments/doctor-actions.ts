"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadMyDoctors } from "@/lib/myDoctors";
import { liveFeatures } from "@/lib/liveFeatures";

// 1.5.0 patients with several doctors (migration 164; behind
// liveFeatures.multiDoctor). "+ Adicionar médico" and "Desconectar".

export type ConnectResult =
  | { outcome: "connected" | "already_connected"; doctor: string; doctorId: string }
  | { outcome: "unavailable" | "invalid" | "too_many_attempts" | "refused" | "error" };

// connect_doctor_with_code (38): 'connected' | 'already_connected' |
// 'unavailable' (that practice removed this account) | 'invalid'. The
// doctor's name comes from get_my_doctors (the only list a patient reads).
export async function connectDoctor(code: string): Promise<ConnectResult> {
  // A server action is a public endpoint: nothing before the release (9a).
  if (!liveFeatures.multiDoctor) return { outcome: "error" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (!clean) return { outcome: "invalid" };
  const { data, error } = await supabase.rpc("connect_doctor_with_code", { p_code: clean });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("too_many_attempts")) return { outcome: "too_many_attempts" };
    // With the server switch off a second doctor is refused as before.
    if (msg.includes("already_invited_by_another_professional") || msg.includes("already_connected")) return { outcome: "refused" };
    return { outcome: "error" };
  }
  const row = ((Array.isArray(data) ? data[0] : data) ?? null) as { outcome: string; professional_id: string | null } | null;
  if (!row) return { outcome: "error" };
  if ((row.outcome === "connected" || row.outcome === "already_connected") && row.professional_id) {
    const doctors = await loadMyDoctors(supabase);
    const d = doctors?.find((x) => x.id === row.professional_id);
    revalidatePath("/my-appointments");
    return { outcome: row.outcome, doctor: d?.name ?? "", doctorId: row.professional_id };
  }
  return { outcome: row.outcome === "unavailable" ? "unavailable" : "invalid" };
}

export type DisconnectResult = { ok: true } | { ok: false; code: "has_future_visits" | "not_connected" | "error" };

// disconnect_doctor (38): refused while a scheduled/confirmed visit with
// that doctor is ahead; otherwise the pending requests to that doctor are
// cancelled, and the SERVER tells the clinic, once per request ("Pedido
// cancelado"; 171, the push service). The doctor keeps the record.
// Without multiDoctor (www today) only the one-doctor card's case is open (01, 10-26):
// the patient's own primary doctor (user_roles.invited_by_professional_id, else the
// linked patient row's practice), checked here; the RPC checks the connection itself.
export async function disconnectDoctor(professionalId: string): Promise<DisconnectResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "error" };
  if (!liveFeatures.multiDoctor && (await primaryDoctorOf(supabase, user.id)) !== professionalId) return { ok: false, code: "error" };
  const { error } = await supabase.rpc("disconnect_doctor", { p_professional_id: professionalId });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("has_future_visits")) return { ok: false, code: "has_future_visits" };
    if (msg.includes("not_connected")) return { ok: false, code: "not_connected" };
    return { ok: false, code: "error" };
  }
  revalidatePath("/my-appointments");
  return { ok: true };
}

// The patient's primary doctor (the one-doctor card's), as My appointments reads it.
async function primaryDoctorOf(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: role } = await supabase.from("user_roles").select("role, invited_by_professional_id, linked_patient_id").eq("user_id", userId).maybeSingle();
  const r = role as { role?: string | null; invited_by_professional_id?: string | null; linked_patient_id?: string | null } | null;
  if (r?.role !== "patient") return null;
  if (r.invited_by_professional_id) return r.invited_by_professional_id;
  if (!r.linked_patient_id) return null;
  const { data } = await supabase.rpc("get_linked_professional_id");
  return (data as string | null) ?? null;
}
