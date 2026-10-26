import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromStoredRules } from "./rules";
import type { ChannelConfig } from "./score";
import type { ReasonKind } from "./requestScore";
import { toMyRequests, type PcMyRequest } from "./patientPage";

// The patient routes' server reads (M4b). Access is 237's own check, run AS the patient:
// pc_patient_page refuses unless signed in, the channel is on for them, they're connected
// to the practice, the practice isn't closed and they aren't archived, and the doctor
// turned the channel on. Then the rules and the reason are read with the service role
// (the weights never reach the patient).

export type AccessCode = "unauthorized" | "channel_off" | "not_connected" | "pc_practice_closed" | "pc_patient_archived" | "failed";
const CODES: AccessCode[] = ["channel_off", "not_connected", "pc_practice_closed", "pc_patient_archived"];

export type PatientPageRpc = {
  country: string | null;
  slaBusinessDays: number;
  readingHours: unknown;
  readingNote: string | null;
  welcome: string | null;
  pageBg: string;
  // The cover's path in the public pc-covers bucket (237), or null.
  coverPath?: string | null;
  rulesVersion: number;
  brand: { displayName?: string | null; title?: string | null; accentColor?: string | null } | null;
  reasons: { id: string; title: string; subtitle: string | null; kind: ReasonKind; options: string[]; destination: "doctor" | "secretary" }[];
  faq: { id: string; question: string; answer: string }[];
  vocabulary: { symptoms: { id: string; name: string; words: string[]; immediateWarning: boolean }[]; medicines: string[] };
};

export function accessCode(message: string | undefined): AccessCode {
  const m = message ?? "";
  if (m.includes("not_signed_in")) return "unauthorized";
  return CODES.find((c) => m.includes(c)) ?? "failed";
}

export async function patientPage(db: SupabaseClient, profId: string): Promise<{ ok: true; page: PatientPageRpc } | { ok: false; code: AccessCode }> {
  const { data, error } = await db.rpc("pc_patient_page", { p_prof: profId });
  if (error) return { ok: false, code: accessCode(error.message) };
  return { ok: true, page: data as PatientPageRpc };
}

// The patient's own requests with a practice (237's pc_my_requests, as the patient): newest
// first, never a score. [] on a failed read.
export async function myRequestsWith(db: SupabaseClient, profId: string): Promise<PcMyRequest[]> {
  const { data, error } = await db.rpc("pc_my_requests", { p_prof: profId });
  return error ? [] : toMyRequests(data);
}

// What the doctor card offers (01, 10-26): "open" (the channel takes messages: "Fale com o
// Médico"); "view" (it doesn't right now, the doctor's own switch off or no longer
// connected, but the patient has requests there: "Ver minhas mensagens", read-only); null
// (nothing). The platform-wide switch off is the emergency stop: callers check
// patientChannelEnabled first and offer nothing (pc_my_requests answers [] there anyway).
export type ChannelEntry = "open" | "view" | null;
export async function channelEntry(db: SupabaseClient, profId: string): Promise<ChannelEntry> {
  const access = await patientPage(db, profId);
  if (access.ok) return "open";
  if (access.code !== "channel_off" && access.code !== "not_connected") return null;
  return (await myRequestsWith(db, profId)).length > 0 ? "view" : null;
}

// The HTTP status of an access refusal (§4.7).
export function accessStatus(code: AccessCode): number {
  return code === "unauthorized" ? 401 : code === "channel_off" ? 404 : code === "failed" ? 500 : 403;
}

export async function practiceRules(admin: SupabaseClient, profId: string): Promise<{ config: ChannelConfig; version: number } | null> {
  const [settings, prof] = await Promise.all([
    admin.from("pc_settings").select("rules, rules_version, ai_mapping").eq("professional_id", profId).maybeSingle(),
    admin.from("professionals").select("country").eq("id", profId).maybeSingle(),
  ]);
  if (settings.error || !settings.data) return null;
  const s = settings.data as { rules: unknown; rules_version: number; ai_mapping: boolean };
  const country = ((prof.data as { country?: string | null } | null)?.country ?? undefined) || undefined;
  return { config: fromStoredRules(s.rules, country, s.ai_mapping === true), version: s.rules_version };
}

export async function practiceReason(admin: SupabaseClient, profId: string, reasonId: string): Promise<{ kind: ReasonKind; options: string[] } | null> {
  const { data, error } = await admin.from("pc_reasons").select("kind, options").eq("id", reasonId).eq("professional_id", profId).is("archived_at", null).maybeSingle();
  if (error || !data) return null;
  const r = data as { kind: ReasonKind; options: string[] | null };
  return { kind: r.kind, options: Array.isArray(r.options) ? r.options : [] };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
