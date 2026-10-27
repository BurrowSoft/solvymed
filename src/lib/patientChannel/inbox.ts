import type { Band, ChannelConfig, Match, ScoreLine } from "./score";
import { findTerms, toVocabulary } from "./score";

// Patient Channel M5: the doctor's / secretary's inbox (specs/patient-contact-tech.md §6).
// The rows come from pc_requests through 237's RLS (the doctor: the whole practice; a
// secretary: destination 'secretary', or all when the doctor allows), never with the
// service role. Substituted requests stay out of the list: they show in the history.

export type InboxStatus = "open" | "answered" | "call_back" | "substituted";
export type InboxFilter = "all" | "red" | "amber" | "green" | "secretary" | "open";
export const INBOX_FILTERS: InboxFilter[] = ["all", "red", "amber", "green", "secretary", "open"];

export type InboxRow = {
  id: string;
  patientId: string;
  patientName: string;
  destination: "doctor" | "secretary";
  band: Band;
  score: number;
  status: InboxStatus;
  reasonTitle: string;
  text: string;
  createdAt: string;
};

export type InboxCounts = {
  open: number; urgent: number; attention: number; notUrgent: number;
  openForDoctor: number; openForSecretary: number;
  faqResolved7d: number; autoResolved7d: number;
  // Open administrative requests (an options / exam reason: no score). With 256 the three band
  // counts are clinical only, and the four add up to open. 0 from an older answer.
  admin: number;
};

// The columns the list reads (with the practice's patient row, also under RLS). Never the
// patient's message text: it shows only in the detail, whose opening is access-logged (241;
// cf's privacy review F2, 01, 10-26).
export const INBOX_COLUMNS = "id, patient_id, destination, band, score_total, status, created_at, reason_snapshot, patients(full_name)";

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function toInboxRow(r: Raw): InboxRow {
  const patient = (Array.isArray(r.patients) ? r.patients[0] : r.patients) as Raw | null | undefined;
  const snap = (r.reason_snapshot ?? {}) as Raw;
  return {
    id: str(r.id),
    patientId: str(r.patient_id),
    patientName: str(patient?.full_name),
    destination: r.destination === "secretary" ? "secretary" : "doctor",
    band: r.band === "red" || r.band === "amber" ? r.band : "green",
    score: num(r.score_total),
    status: (["open", "answered", "call_back", "substituted"] as const).find((s) => s === r.status) ?? "open",
    reasonTitle: str(snap.title),
    text: str(r.text),
    createdAt: str(r.created_at),
  };
}

export function parseFilter(v: string | string[] | undefined): InboxFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return INBOX_FILTERS.find((f) => f === s) ?? "all";
}

// Open first; then the highest score; then the oldest (waiting longest); closed ones by
// newest reply time is not stored here, so by newest sent.
export function sortInbox(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.status === "open" ? 0 : 1;
    const bo = b.status === "open" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (ao === 0) {
      if (a.score !== b.score) return b.score - a.score;
      return a.createdAt.localeCompare(b.createdAt);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function filterInbox(rows: InboxRow[], filter: InboxFilter): InboxRow[] {
  const shown = rows.filter((r) => r.status !== "substituted");
  switch (filter) {
    case "all": return shown;
    case "open": return shown.filter((r) => r.status === "open");
    case "secretary": return shown.filter((r) => r.destination === "secretary");
    default: return shown.filter((r) => r.band === filter);
  }
}

export function toCounts(raw: unknown): InboxCounts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return {
    open: num(r.open), urgent: num(r.urgent), attention: num(r.attention), notUrgent: num(r.notUrgent),
    openForDoctor: num(r.openForDoctor), openForSecretary: num(r.openForSecretary),
    faqResolved7d: num(r.faqResolved7d), autoResolved7d: num(r.autoResolved7d),
    admin: num(r.admin),
  };
}

// ─── The detail ────────────────────────────────────────────────────────────

export type DetailAnswers =
  | { kind: "form"; symptomIds: string[]; chips: { kind: "symptom" | "medicine"; ref: string; text: string }[]; when: number; intensity: number; stillTaking: number }
  | { kind: "option"; option: string };

export function toDetailAnswers(raw: unknown): DetailAnswers {
  const a = (raw ?? {}) as Raw;
  if (typeof a.option === "string") return { kind: "option", option: a.option };
  const chips = Array.isArray(a.chips)
    ? a.chips.filter((c): c is Raw => !!c && typeof c === "object").map((c) => ({
        kind: c.kind === "medicine" ? "medicine" as const : "symptom" as const, ref: str(c.ref), text: str(c.text),
      }))
    : [];
  return {
    kind: "form",
    symptomIds: Array.isArray(a.symptomIds) ? a.symptomIds.filter((x): x is string => typeof x === "string") : [],
    chips,
    when: num(a.when), intensity: num(a.intensity), stillTaking: num(a.stillTaking),
  };
}

export type ShownMessage = { id: string; text: string; tone: "info" | "attention" };
export function toShownMessages(raw: unknown): ShownMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Raw => !!m && typeof m === "object" && typeof (m as Raw).text === "string")
    .map((m) => ({ id: str(m.id), text: str(m.text), tone: m.tone === "attention" ? "attention" : "info" }));
}

// What the detail needs from the rules, and nothing more: the names of the symptoms and
// combinations the lines and answers name, and the highlights in the text. The rules
// themselves (the weights) never reach a secretary's browser (cf's M0 point 4); these
// are computed on the server.
// warnings: the ids (among those) with the immediate warning, for the safety-floor line.
export type DetailNames = { symptoms: Record<string, string>; combos: Record<string, string[]>; warnings: string[] };

export function detailNames(config: ChannelConfig | null, lines: ScoreLine[], symptomIds: string[]): DetailNames {
  const symptoms: Record<string, string> = {};
  const combos: Record<string, string[]> = {};
  const warnings: string[] = [];
  if (!config) return { symptoms, combos, warnings };
  const want = new Set(symptomIds);
  for (const l of lines) {
    if ("comboId" in l.label) {
      const c = config.combinations.find((x) => x.id === (l.label as { comboId: string }).comboId);
      if (c) {
        combos[c.id] = c.symptomIds;
        c.symptomIds.forEach((id) => want.add(id));
      }
    } else {
      want.add(l.label.symptomId);
    }
  }
  for (const s of config.symptoms) {
    if (!want.has(s.id)) continue;
    symptoms[s.id] = s.name;
    if (s.immediateWarning) warnings.push(s.id);
  }
  return { symptoms, combos, warnings };
}

export function detailHighlights(config: ChannelConfig | null, text: string): Match[] {
  if (!config || !text) return [];
  return findTerms(toVocabulary(config), text);
}

export function toLines(raw: unknown): ScoreLine[] {
  return Array.isArray(raw) ? (raw.filter((l) => l && typeof l === "object" && (l as Raw).label) as ScoreLine[]) : [];
}

// A line in the viewer's language from the names above (the test mode's lineLabel, with
// names instead of the rules). A name the rules no longer have (renamed or removed after
// the snapshot) shows as "?" rather than a wrong one.
export function detailLineLabel(names: DetailNames, line: ScoreLine, t: (key: string, values?: Record<string, string | number>) => string): string {
  const symptom = (id: string) => names.symptoms[id] ?? "?";
  let base: string;
  if ("comboId" in line.label) {
    base = t("lines.combo", { names: (names.combos[(line.label as { comboId: string }).comboId] ?? []).map(symptom).join(" + ") || "?" });
  } else {
    base = symptom(line.label.symptomId);
    if (line.source === "text") base = `${base} ${t("lines.text")}`;
  }
  if (line.source === "ai") base = `${t("lines.ai")} · ${base}`;
  const { answerKey, answerIndex } = line.label;
  return answerKey !== undefined && answerIndex !== undefined ? `${base} · ${t(`answers.${answerKey}${answerIndex}`)}` : base;
}

// Text split into plain and highlighted parts (longest match first; findTerms already
// resolves overlaps).
export function highlightParts(text: string, matches: Match[]): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < at || m.end > text.length) continue;
    if (m.start > at) out.push({ text: text.slice(at, m.start), mark: false });
    out.push({ text: text.slice(m.start, m.end), mark: true });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

export const REPLY_MAX = 500;

// Why a request is Urgent through the safety floor (01, 10-26): a symptom with the immediate
// warning that the patient chose or wrote (boxes, chips, text: patientIds, even one worth 0
// points, which has no line; cf), else one only the AI found (its "IA" line). null otherwise.
export function warningFloorCause(warningIds: string[], patientIds: string[], lines: ScoreLine[], band: Band): "patient" | "ai" | null {
  if (band !== "red" || warningIds.length === 0) return null;
  if (patientIds.some((id) => warningIds.includes(id))) return "patient";
  if (lines.some((l) => l.source === "ai" && "symptomId" in l.label && warningIds.includes(l.label.symptomId))) return "ai";
  return null;
}
