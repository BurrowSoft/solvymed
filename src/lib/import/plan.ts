// The patient import's column plan (migrations 130/131): which of the
// file's columns go to which SolvyMed field, per the presets (copied from
// the mobile repo's supabase/import-presets, feat/import-presets 68cd763;
// see its README for the rule vocabulary). The database stays the single
// source of truth for values: a preset only routes columns and translates a
// system's own codes; cells are sent as read.
import generic from "./presets/generic.v2.json";
import iclinic from "./presets/iclinic.v2.json";
import prontuarioVerde from "./presets/prontuario_verde.v2.json";

export const IMPORT_FIELDS = [
  "full_name", "cpf", "th_national_id", "passport_number", "birth_date", "sex", "phone", "email", "rg", "profession", "tags",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportSource = "generic" | "iclinic" | "prontuario_verde";

type Values = Record<string, string | null>;
type ColumnRule = {
  field?: ImportField | "archived"; priority?: number; else_extra?: string;
  extra?: string; values?: Values; split?: string; join?: string; ignore?: boolean; sensitive?: boolean;
};
export type Preset = {
  source: ImportSource; version: number; label: string;
  fingerprint?: { files?: string[]; zip_files?: string[]; headers_all?: string[]; headers_any?: (string | string[])[] };
  unlisted?: "generic_suggest";
  read?: { encodings?: string[]; delimiters?: string[] };
  columns?: Record<string, ColumnRule>;
  suggest?: Partial<Record<ImportField, string[]>>;
  extra_suggest?: Record<string, string[]>;
};

export const PRESETS: Preset[] = [generic as Preset, iclinic as Preset, prontuarioVerde as Preset];
export const presetFor = (source: ImportSource): Preset => PRESETS.find((p) => p.source === source) ?? (generic as Preset);

// What happens to one column. `kind` is what the doctor sees and can change;
// the rest comes from the preset (codes, priorities, splitting).
export type ColumnPlan = {
  index: number;
  header: string;
  kind: "field" | "extra" | "ignore";
  field?: ImportField | "archived";
  label?: string;          // the extra's label (shown as "Dados importados")
  priority?: number;
  elseExtra?: string;
  values?: Values;
  split?: string;
  join?: string;
  sensitive?: boolean;     // ignored by default, with a switch to keep it
  keep?: boolean;          // the doctor turned a sensitive column back on
  namePart?: "first" | "last"; // first + last name joined into the full name
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Case-, accent- and punctuation-insensitive (the presets README): only
// Latin diacritics go (U+0300–036F), so Thai vowel and tone marks stay;
// NFKD also turns "º" into "o" ("Nº" = "no"). Punctuation is a space.
export function normalizeHeader(h: string): string {
  return h.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

// The presets README "Recognising a system's file": a system is picked when
// the uploaded file's name is in `files` (or a file inside a ZIP is in
// `files` / `zip_files`), matched exactly and case-sensitively; or when
// every `headers_all` header is present and at least one `headers_any` entry
// is (an array: a group, all present). Headers ignore case and surrounding
// spaces. The highest matching version wins; no match is the generic sheet.
export function detectSource(headers: string[], fileName?: string, inZip: string[] = []): ImportSource {
  const hs = new Set(headers.map((h) => h.trim().toLowerCase()));
  const has = (h: string) => hs.has(h.trim().toLowerCase());
  const hits = PRESETS.filter((p) => {
    const f = p.fingerprint;
    if (!f) return false;
    const byName = (f.files ?? []).some((n) => n === fileName || inZip.includes(n)) || (f.zip_files ?? []).some((n) => inZip.includes(n));
    const byHeaders = (f.headers_all ?? []).every(has) && (f.headers_any ?? []).some((e) => (Array.isArray(e) ? e.every(has) : has(e)));
    return byName || byHeaders;
  }).sort((x, y) => y.version - x.version);
  return hits[0]?.source ?? "generic";
}

export function planColumns(source: ImportSource, headers: string[]): ColumnPlan[] {
  return joinNames(planEach(source, headers));
}

// First and last name in separate columns (Nome + Sobrenome, ชื่อ +
// นามสกุล, First + Last name): joined into the full name by default (UX),
// unless the file also has a full-name column. "Usar colunas separadas"
// undoes it (separateNames).
const FIRST_NAME = ["nome", "primeiro nome", "first name", "firstname", "given name", "ชื่อ"].map(normalizeHeader);
const LAST_NAME = ["sobrenome", "ultimo nome", "last name", "lastname", "surname", "family name", "นามสกุล"].map(normalizeHeader);
function joinNames(plan: ColumnPlan[]): ColumnPlan[] {
  const last = plan.find((c) => LAST_NAME.includes(normalizeHeader(c.header)));
  const first = plan.find((c) => c !== last && FIRST_NAME.includes(normalizeHeader(c.header)));
  if (!first || !last) return plan;
  if (plan.some((c) => c !== first && c !== last && c.kind === "field" && c.field === "full_name")) return plan;
  return plan.map((c) =>
    c === first ? { index: c.index, header: c.header, kind: "field", field: "full_name", namePart: "first" }
      : c === last ? { index: c.index, header: c.header, kind: "field", field: "full_name", namePart: "last" }
        : c);
}
export function separateNames(plan: ColumnPlan[]): ColumnPlan[] {
  return plan.map((c) =>
    c.namePart === "first" ? { index: c.index, header: c.header, kind: "field", field: "full_name" }
      : c.namePart === "last" ? { index: c.index, header: c.header, kind: "extra", label: c.header.trim() }
        : c);
}

function planEach(source: ImportSource, headers: string[]): ColumnPlan[] {
  const preset = presetFor(source);
  const gen = presetFor("generic");
  const taken = new Set<ImportField>();
  // A system preset's own columns present in this file, and the fields they fill.
  const ruleFor = (header: string) => {
    const key = Object.keys(preset.columns ?? {}).find((k) => same(k, header));
    return key ? preset.columns![key] : undefined;
  };
  for (const h of headers) {
    const f = ruleFor(h)?.field;
    if (f && f !== "archived") taken.add(f);
  }
  // Generic's suggestions: the first column wins a field not yet filled.
  const suggest = (base: { index: number; header: string }): ColumnPlan | null => {
    const n = normalizeHeader(base.header);
    for (const f of IMPORT_FIELDS) {
      if (taken.has(f)) continue;
      if ((gen.suggest?.[f] ?? []).some((s) => normalizeHeader(s) === n)) {
        taken.add(f);
        return { ...base, kind: "field", field: f, split: f === "tags" ? ";" : undefined };
      }
    }
    return null;
  };
  return headers.map((header, index): ColumnPlan => {
    const base = { index, header };
    if (preset.columns) {
      const rule = ruleFor(header);
      // Not in the preset: generic's suggestion ("unlisted": "generic_suggest")
      // unless the preset already fills that field; else kept as imported data,
      // never silently lost.
      if (!rule) return (preset.unlisted === "generic_suggest" ? suggest(base) : null) ?? { ...base, kind: "extra", label: header.trim() };
      if (rule.ignore) return { ...base, kind: "ignore" };
      if (rule.field) {
        return { ...base, kind: "field", field: rule.field, priority: rule.priority, elseExtra: rule.else_extra, values: rule.values, split: rule.split };
      }
      return { ...base, kind: "extra", label: rule.extra ?? header.trim(), values: rule.values, split: rule.split, join: rule.join, sensitive: rule.sensitive };
    }
    // The generic sheet: header suggestions; the first column wins a field.
    const hit = suggest(base);
    if (hit) return hit;
    const n = normalizeHeader(header);
    const extra = Object.entries(preset.extra_suggest ?? {}).find(([, aliases]) => aliases.some((s) => normalizeHeader(s) === n));
    return { ...base, kind: "extra", label: extra ? extra[0] : header.trim() };
  });
}

export type ImportRow = { row: number; archived?: "inactive" | "deceased"; extra?: Record<string, string>; tags?: string[] } & Partial<Record<ImportField, string | number | string[]>>;

const cellText = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v) : String(v).trim());
const lookup = (values: Values | undefined, raw: string): { hit: boolean; value: string | null } => {
  if (!values) return { hit: false, value: raw };
  const key = Object.keys(values).find((k) => k === raw) ?? Object.keys(values).find((k) => same(k, raw));
  return key === undefined ? { hit: false, value: raw } : { hit: true, value: values[key] };
};

// The rows for import_patients_add_rows: `row` is the spreadsheet's own line
// number (the header is line 1), so the error list points at the right line.
// Birth dates keep Excel's serial numbers (the database converts them).
export function buildRows(plan: ColumnPlan[], data: unknown[][], firstLine = 2): ImportRow[] {
  const out: ImportRow[] = [];
  data.forEach((cells, i) => {
    const row: ImportRow = { row: firstLine + i };
    const extra: Record<string, string> = {};
    const candidates = new Map<ImportField, { order: number; value: string | number | string[]; elseExtra?: string }[]>();
    let archived: "inactive" | "deceased" | undefined;
    const name: { first?: string; last?: string; order?: number } = {};
    for (const col of plan) {
      const rawValue = cells[col.index];
      const raw = cellText(rawValue);
      if (col.namePart && col.kind === "field") {
        name[col.namePart] = raw;
        if (col.namePart === "first") name.order = col.priority ?? 100 + col.index;
        continue;
      }
      if (col.kind === "ignore" || raw === "") continue;
      if (col.kind === "extra") {
        if (col.sensitive && !col.keep) continue;
        const parts = col.split ? raw.split(col.split).map((s) => s.trim()).filter(Boolean) : [raw];
        const labels = parts.map((p) => { const { value } = lookup(col.values, p); return value ?? ""; }).filter(Boolean);
        if (labels.length) extra[col.label ?? col.header] = labels.join(col.join ?? ", ");
        continue;
      }
      if (col.field === "archived") {
        // An unmapped code sends nothing (an active patient has no key).
        const { hit, value } = lookup(col.values, raw);
        if (hit && (value === "deceased" || value === "inactive")) archived = archived === "deceased" ? "deceased" : value;
        continue;
      }
      const field = col.field as ImportField;
      const { value } = lookup(col.values, raw);
      if (value === null) continue; // mapped to "send nothing"
      let v: string | number | string[] = field === "birth_date" && typeof rawValue === "number" ? rawValue : value;
      if (field === "tags") v = String(value).split(col.split ?? ";").map((s) => s.trim()).filter(Boolean);
      const list = candidates.get(field) ?? [];
      list.push({ order: col.priority ?? 100 + col.index, value: v, elseExtra: col.elseExtra });
      candidates.set(field, list);
    }
    // First + " " + last, empty parts skipped.
    const joined = [name.first, name.last].filter(Boolean).join(" ");
    if (joined) {
      const list = candidates.get("full_name") ?? [];
      list.push({ order: name.order ?? 0, value: joined });
      candidates.set("full_name", list);
    }
    for (const [field, list] of candidates) {
      list.sort((a, b) => a.order - b.order);
      const [win, ...rest] = list;
      if (field === "tags") row.tags = list.flatMap((c) => c.value as string[]);
      else row[field] = win.value;
      // A non-empty cell that didn't win is kept, never dropped.
      if (field !== "tags") for (const r of rest) if (r.elseExtra) extra[r.elseExtra] = String(r.value);
    }
    if (archived) row.archived = archived;
    if (Object.keys(extra).length) row.extra = extra;
    out.push(row);
  });
  return out;
}
