// The Patient Channel's practice settings, reasons and FAQ (M3b-2; migration 237's
// pc_settings / pc_reasons / pc_faq, written by the doctor under RLS). Pure: the types,
// the defaults and the checks 237 enforces (CHECKs and _pc_hours_valid), so the page
// refuses what the database would.

export type PageBg = "watermark" | "cover" | "both" | "plain";
export const PAGE_BGS: PageBg[] = ["both", "cover", "watermark", "plain"];

// [{ days: 1..7 (Mon = 1), from: "HH:MM", to: "HH:MM" }] in the practice's time zone.
export type ReadingHours = { days: number[]; from: string; to: string }[];

export type PcSettings = {
  enabled: boolean;
  secretarySeesAll: boolean;
  slaBusinessDays: 1 | 2 | 3;
  readingHours: ReadingHours;
  readingNote: string;
  welcome: string;
  pageBg: PageBg;
};

export const DEFAULT_SETTINGS: PcSettings = {
  enabled: false,
  secretarySeesAll: false,
  slaBusinessDays: 2,
  readingHours: [],
  readingNote: "",
  welcome: "",
  pageBg: "both",
};

export const CHANNEL_LIMITS = {
  readingNote: 120,
  welcome: 240,
  hoursRows: 14,
  reasonTitle: 80,
  reasonSubtitle: 120,
  reasonOptions: 12,
  reasonOption: 80,
  faqQuestion: 160,
  faqAnswer: 1000,
} as const;

export type ReasonKind = "options" | "symptom_form" | "exam";
export type PcReasonRow = {
  id: string;
  title: string;
  subtitle: string;
  kind: ReasonKind;
  options: string[];
  destination: "doctor" | "secretary";
  sort: number;
};
export type PcFaqRow = { id: string; question: string; answer: string; sort: number };

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const len = (s: string) => [...s.trim()].length;

// 237's _pc_hours_valid.
export function hoursValid(h: ReadingHours): boolean {
  return h.length <= CHANNEL_LIMITS.hoursRows && h.every((r) =>
    r.days.length >= 1 && r.days.length <= 7 && r.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
    HHMM.test(r.from) && HHMM.test(r.to) && r.from < r.to);
}

// The settings row as the page saves it (snake_case, 237's columns; empty texts → null).
export function settingsRow(s: PcSettings) {
  return {
    enabled: s.enabled,
    secretary_sees_all: s.secretarySeesAll,
    sla_business_days: s.slaBusinessDays,
    reading_hours: s.readingHours.map((r) => ({ days: [...new Set(r.days)].sort(), from: r.from, to: r.to })),
    reading_note: s.readingNote.trim() || null,
    welcome: s.welcome.trim() || null,
    page_bg: s.pageBg,
  };
}

export function settingsFromRow(row: Record<string, unknown> | null | undefined): PcSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const sla = row.sla_business_days;
  return {
    enabled: row.enabled === true,
    secretarySeesAll: row.secretary_sees_all === true,
    slaBusinessDays: sla === 1 || sla === 3 ? sla : 2,
    readingHours: Array.isArray(row.reading_hours) ? (row.reading_hours as ReadingHours) : [],
    readingNote: typeof row.reading_note === "string" ? row.reading_note : "",
    welcome: typeof row.welcome === "string" ? row.welcome : "",
    pageBg: PAGE_BGS.includes(row.page_bg as PageBg) ? (row.page_bg as PageBg) : "both",
  };
}

export type SettingsProblem = "hours" | "readingNote" | "welcome";
export function settingsProblems(s: PcSettings): SettingsProblem[] {
  const out: SettingsProblem[] = [];
  if (!hoursValid(s.readingHours)) out.push("hours");
  if (s.readingNote.length > CHANNEL_LIMITS.readingNote) out.push("readingNote");
  if (s.welcome.length > CHANNEL_LIMITS.welcome) out.push("welcome");
  return out;
}

// One option per line; trimmed, empty lines and repeats dropped, at most 12.
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const o = line.trim();
    if (!o || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
  }
  return out;
}

export type ReasonProblem = "title" | "subtitle" | "options" | "optionLength";
export function reasonProblems(r: Omit<PcReasonRow, "id" | "sort">): ReasonProblem[] {
  const out: ReasonProblem[] = [];
  if (len(r.title) < 1 || len(r.title) > CHANNEL_LIMITS.reasonTitle) out.push("title");
  if (r.subtitle.length > CHANNEL_LIMITS.reasonSubtitle) out.push("subtitle");
  if (r.kind !== "symptom_form" && r.options.length === 0) out.push("options");
  if (r.options.length > CHANNEL_LIMITS.reasonOptions) out.push("options");
  if (r.options.some((o) => len(o) < 1 || len(o) > CHANNEL_LIMITS.reasonOption)) out.push("optionLength");
  return out;
}

export type FaqProblem = "question" | "answer";
export function faqProblems(f: Omit<PcFaqRow, "id" | "sort">): FaqProblem[] {
  const out: FaqProblem[] = [];
  if (len(f.question) < 1 || len(f.question) > CHANNEL_LIMITS.faqQuestion) out.push("question");
  if (len(f.answer) < 1 || len(f.answer) > CHANNEL_LIMITS.faqAnswer) out.push("answer");
  return out;
}

// Moving an item up or down: the two swap, everything is numbered 1..n, and only the rows
// whose sort changes are returned (older rows may share a value).
export function swapSort<T extends { id: string; sort: number }>(rows: T[], id: string, dir: -1 | 1): { id: string; sort: number }[] {
  const order = [...rows].sort((a, b) => a.sort - b.sort);
  const i = order.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return [];
  [order[i], order[j]] = [order[j], order[i]];
  return order.map((r, k) => ({ id: r.id, sort: k + 1, was: r.sort })).filter((c) => c.sort !== c.was).map(({ id, sort }) => ({ id, sort }));
}
