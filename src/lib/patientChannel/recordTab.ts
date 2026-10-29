import "server-only";
import { conditionMet } from "@/lib/conditions";
import { shortDoctorName, withBrandTitle } from "@/lib/doctorName";
import { myPractices } from "@/lib/effectiveProfId";
import type { createClient } from "@/lib/supabase/server";
import type { Band } from "./score";
import { isUnscored } from "./unscored";
import type { InboxStatus } from "./inbox";

// The patient record's "Canal do Paciente" tab (specs/pc-patient-record-tab.md, 01 + Vitor
// 10-30): the requests this patient sent the practice, newest first, read from pc_requests
// under 237's RLS (the inbox's query, by patient; no new RPC). Never the message text (the
// detail has it, access-logged) and never the self-serve counts (anonymous by design).
// Who: the doctor, or a secretary with "sees all" (as the inbox's report link). Without it
// the page doesn't even ask: RLS would still give her the front desk's requests, which her
// inbox already shows, so the hidden tab is the spec's rule, not a data boundary.
// Hidden too when the practice never set the channel up and the patient sent nothing.

export function pcRecordTabLive(): boolean {
  return conditionMet("pc-record-tab-live");
}

export type RecordTabRow = {
  id: string;
  createdAt: string;
  // The date and time, formatted on the server (the clinic's zone and calendar).
  when: string;
  // null: an administrative request (no score, so no band; isUnscored).
  band: Band | null;
  status: InboxStatus;
  destination: "doctor" | "secretary";
  reasonTitle: string;
};

// What the tab needs; null = no tab.
export type RecordTab = { rows: RecordTabRow[]; failed: boolean; doctorName: string };

const COLUMNS = "id, destination, band, status, created_at, reason_snapshot";
export const RECORD_TAB_LIMIT = 200;

type Db = Awaited<ReturnType<typeof createClient>>;
type Raw = Record<string, unknown>;

export function toRecordTabRow(r: Raw, formatWhen: (iso: string) => string): RecordTabRow {
  const snap = (r.reason_snapshot ?? {}) as Raw;
  const createdAt = typeof r.created_at === "string" ? r.created_at : "";
  return {
    id: String(r.id ?? ""),
    createdAt,
    when: createdAt ? formatWhen(createdAt) : "",
    band: isUnscored(r.reason_snapshot) ? null : r.band === "red" || r.band === "amber" ? r.band : "green",
    status: (["open", "answered", "call_back", "substituted"] as const).find((s) => s === r.status) ?? "open",
    destination: r.destination === "secretary" ? "secretary" : "doctor",
    reasonTitle: typeof snap.title === "string" ? snap.title : "",
  };
}

export async function loadRecordTab(
  supabase: Db,
  { userId, profId, patientId, isSecretary, formatWhen }: {
    userId: string; profId: string; patientId: string; isSecretary: boolean; formatWhen: (iso: string) => string;
  },
): Promise<RecordTab | null> {
  if (!pcRecordTabLive()) return null;
  const settings = await supabase.from("pc_settings").select("secretary_sees_all").eq("professional_id", profId).maybeSingle();
  if (isSecretary && settings.data?.secretary_sees_all !== true) return null;
  const { data, error } = await supabase.from("pc_requests").select(COLUMNS)
    .eq("professional_id", profId).eq("patient_id", patientId)
    .order("created_at", { ascending: false }).limit(RECORD_TAB_LIMIT);
  const rows = ((data ?? []) as Raw[]).map((r) => toRecordTabRow(r, formatWhen));
  if (!error && rows.length === 0 && !settings.error && !settings.data) return null;
  // A secretary reads "Para {doctor}" on the doctor's requests (the inbox's wording).
  let doctorName = "";
  if (isSecretary) {
    const practice = (await myPractices(userId))?.find((p) => p.professional_id === profId);
    doctorName = practice ? withBrandTitle(practice.title, shortDoctorName(practice.display_name)) : "";
  }
  return { rows, failed: !!error, doctorName };
}
