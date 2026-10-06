// Record templates (1.8.0 D; migration 189, behind server flag
// 'record_templates'). A template is a name + ordered sections {title, hint};
// a record written with one keeps its own copy of the sections
// (medical_records.template_name + sections [{title, text}]), so editing or
// deleting the template never changes records already written. The limits
// below are the database's (189's CHECKs and trg_record_templates_check);
// the app keeps the same ones (lib/record-templates.ts).
import { composeRecordContent } from "./recordPresets";

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_SECTIONS_MAX = 30;
export const SECTION_TITLE_MAX = 120;
export const SECTION_HINT_MAX = 500;
export const TEMPLATES_PER_DOCTOR = 50;
// medical_records.sections: length(sections::text) <= 100000.
export const RECORD_SECTIONS_TEXT_MAX = 100000;

export type TemplateSection = { title: string; hint?: string };
export type RecordTemplate = { id: string; name: string; sections: TemplateSection[]; position: number };
export type RecordSection = { title: string; text: string };

// A template as the doctor typed it, trimmed and checked against the limits.
// Empty rows (no title, no hint) are dropped; a hint without a title isn't.
export function cleanTemplate(input: { name: string; sections: TemplateSection[] }):
  { ok: true; name: string; sections: TemplateSection[] } | { ok: false; error: "name" | "sections" | "title" | "hint" } {
  const name = (input.name ?? "").trim();
  if (!name || name.length > TEMPLATE_NAME_MAX) return { ok: false, error: "name" };
  const sections: TemplateSection[] = [];
  for (const s of input.sections ?? []) {
    const title = (s?.title ?? "").trim();
    const hint = (s?.hint ?? "").trim();
    if (!title && !hint) continue;
    if (!title || title.length > SECTION_TITLE_MAX) return { ok: false, error: "title" };
    if (hint.length > SECTION_HINT_MAX) return { ok: false, error: "hint" };
    sections.push(hint ? { title, hint } : { title });
  }
  if (sections.length < 1 || sections.length > TEMPLATE_SECTIONS_MAX) return { ok: false, error: "sections" };
  return { ok: true, name, sections };
}

// A row's sections as read from the database (jsonb), defensively.
export function parseTemplateSections(raw: unknown): TemplateSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is { title: string; hint?: unknown } => !!x && typeof x === "object" && typeof (x as { title?: unknown }).title === "string")
    .map((x) => (typeof x.hint === "string" && x.hint ? { title: x.title, hint: x.hint } : { title: x.title }));
}

export function parseRecordSections(raw: unknown): RecordSection[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((x): x is { title: string; text?: unknown } => !!x && typeof x === "object" && typeof (x as { title?: unknown }).title === "string")
    .map((x) => ({ title: x.title, text: typeof x.text === "string" ? x.text : "" }));
  return out.length ? out : null;
}

// A record's sections only while they still are the record: an older client
// editing it within the 24 hours changes content alone (d1), and then the
// content is what was written.
export function currentRecordSections(raw: unknown, content: string): RecordSection[] | null {
  const sections = parseRecordSections(raw);
  // CRLF: records saved before the server composed content (a browser
  // sends form text with \r\n, 53).
  return sections && composeRecordContent(sections) === lf(content ?? "").trim() ? sections : null;
}

const lf = (s: string) => s.replace(/\r\n?/g, "\n");

// Switching the template of a record being written never loses typed text
// (cf, 2026-10-07; the app does the same):
// - free text → a template: the text goes into its first section;
// - a template → another: sections with the same title keep their text, any
//   other text goes into the new first section;
// - a template → free text: the sections composed, as they'd be saved.
// movedTo: the section that received text (the doctor is told), or null.
export type DraftRow = { title: string; hint?: string; text: string };
export type Draft = { kind: "free"; text: string } | { kind: "sections"; rows: DraftRow[] };

export function switchTemplate(current: Draft, next: TemplateSection[] | null): { draft: Draft; movedTo: string | null } {
  if (!next || next.length === 0) {
    return { draft: { kind: "free", text: current.kind === "free" ? current.text : composeRecordContent(current.rows) }, movedTo: null };
  }
  const rows: DraftRow[] = next.map((s) => ({ title: s.title, ...(s.hint ? { hint: s.hint } : {}), text: "" }));
  let leftover = "";
  if (current.kind === "free") {
    leftover = current.text.trim();
  } else {
    const norm = (s: string) => s.trim().toLowerCase();
    const used = new Set<number>();
    rows.forEach((r) => {
      const i = current.rows.findIndex((o, j) => !used.has(j) && norm(o.title) === norm(r.title));
      if (i >= 0) { used.add(i); r.text = current.rows[i].text; }
    });
    leftover = composeRecordContent(current.rows.filter((_, j) => !used.has(j)));
  }
  if (!leftover) return { draft: { kind: "sections", rows }, movedTo: null };
  rows[0].text = rows[0].text.trim() ? `${rows[0].text.trimEnd()}\n\n${leftover}` : leftover;
  return { draft: { kind: "sections", rows }, movedTo: rows[0].title };
}

// A record's content and sections from the record form. With sections the
// server composes content itself (the browser's multipart form turns \n into
// \r\n, so the client's copy never matched, 53); free text is kept as typed,
// with LF line ends like the app's.
export function recordInput(rawContent: FormDataEntryValue | null, rawSections: FormDataEntryValue | null):
  { ok: true; content: string; sections: RecordSection[] | null } | { ok: false } {
  const s = recordSectionsFromForm(rawSections);
  if (!s.ok) return { ok: false };
  const sections = s.sections?.map((x) => ({ title: x.title, text: lf(x.text) })) ?? null;
  return { ok: true, content: sections ? composeRecordContent(sections) : lf(typeof rawContent === "string" ? rawContent : "").trim(), sections };
}

// The record's sections from the form (JSON in a hidden field), checked:
// null = a free-text record. Every section is kept, empty ones too, so an
// edit within the 24 hours shows the same structure.
export function recordSectionsFromForm(raw: FormDataEntryValue | null):
  { ok: true; sections: RecordSection[] | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, sections: null };
  let parsed: unknown;
  try { parsed = JSON.parse(String(raw)); } catch { return { ok: false }; }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > TEMPLATE_SECTIONS_MAX) return { ok: false };
  const sections: RecordSection[] = [];
  for (const x of parsed) {
    if (!x || typeof x !== "object") return { ok: false };
    const { title, text } = x as { title?: unknown; text?: unknown };
    if (typeof title !== "string" || !title.trim() || title.length > SECTION_TITLE_MAX) return { ok: false };
    if (typeof text !== "string") return { ok: false };
    sections.push({ title: title.trim(), text: text.trim() });
  }
  // Postgres prints jsonb with a space after each ':' and ',' (4 per section).
  if (JSON.stringify(sections).length + 4 * sections.length > RECORD_SECTIONS_TEXT_MAX) return { ok: false };
  return { ok: true, sections };
}
