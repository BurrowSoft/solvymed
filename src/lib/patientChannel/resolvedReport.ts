import { conditionMet } from "@/lib/conditions";

// Item 43, "Resolved without a message" (specs/pc-resolved-report.md + its contract, cf's OK
// 10-29): which of the practice's FAQ answers and automatic messages solved patients'
// questions without a message, counted per practice-local day (272's pc_selfserve_item_counts:
// no patient, no text, no time of day). Read only through 272's pc_selfserve_report
// (the doctor, or a secretary with "sees all"). Everything here waits for
// pc-resolved-items-live, which flips only after the privacy text describing it is live
// and 272 is applied (the contract's binding order).

export function resolvedReportLive(): boolean {
  return conditionMet("pc-resolved-items-live");
}

// The item that solved it, sent with /selfserve (the route passes it on only while live).
export type SelfServeItem = { kind: "faq" | "auto_message"; id: string };
export const ITEM_ID_MAX = 40;

export function parseSelfServeItem(v: unknown, kind: "faq_resolved" | "auto_resolved"): SelfServeItem | null | "bad" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") return "bad";
  const o = v as { kind?: unknown; id?: unknown };
  const want = kind === "faq_resolved" ? "faq" : "auto_message";
  if (o.kind !== want || typeof o.id !== "string" || o.id.length < 1 || o.id.length > ITEM_ID_MAX) return "bad";
  return { kind: want, id: o.id };
}

export const REPORT_PERIODS = [7, 30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export type ReportItem = { kind: "faq" | "auto_message"; id: string; label: string | null; excerpt: string | null; archived: boolean; n: number };
export type ResolvedReport = { days: ReportPeriod; items: ReportItem[]; unattributed: number; total: number; sent: number };

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// 272's answer, defensively: anything malformed is dropped, never shown half-read.
export function toResolvedReport(data: unknown): ResolvedReport | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (!(REPORT_PERIODS as readonly unknown[]).includes(o.days) || !Array.isArray(o.items)) return null;
  const items = o.items.flatMap((raw): ReportItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if ((r.kind !== "faq" && r.kind !== "auto_message") || typeof r.id !== "string") return [];
    const n = count(r.n);
    return n > 0 ? [{ kind: r.kind, id: r.id, label: text(r.label), excerpt: text(r.excerpt), archived: r.archived === true, n }] : [];
  });
  items.sort((a, b) => b.n - a.n || (a.label ?? "").localeCompare(b.label ?? ""));
  return { days: o.days as ReportPeriod, items, unattributed: count(o.unattributed), total: count(o.total), sent: count(o.sent) };
}

// A row's two lines (01, Q2 / Q5): the FAQ's question ("(arquivada)" when archived); an
// automatic message's terms, with the start of its text in grey (only the text when it has
// no terms); an item that no longer exists, "(item removido)".
export type RowText = { line1: string; line2: string | null };
export function rowText(item: ReportItem, t: (key: string, values?: Record<string, string>) => string): RowText {
  if (!item.label && !item.excerpt) return { line1: t(item.kind === "faq" ? "report.faqRemoved" : "report.autoRemoved"), line2: null };
  if (item.kind === "faq") {
    const q = item.label ?? "";
    return { line1: t("report.faq", { label: item.archived ? t("report.archived", { label: q }) : q }), line2: null };
  }
  return item.label
    ? { line1: t("report.auto", { label: item.label }), line2: item.excerpt }
    : { line1: t("report.auto", { label: item.excerpt ?? "" }), line2: null };
}
