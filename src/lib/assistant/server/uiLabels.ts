import { HELP } from "@/lib/help";
import { ACTIONS } from "@/lib/solvyai/app-map";
import en from "@/messages/en.json";

// The Help articles and the App Map exist in pt/en only, so a Thai answer
// would name "Settings" or "Confirm" in English (d7). The UI labels they
// mention are looked up by their English text in the message files and
// given to the model in the user's language (UX: a Thai answer says
// "ตั้งค่า"). Labels only the app has, with no web message, stay unmapped.

type Messages = typeof en;

// Where a label is looked up first: the screens' own namespaces, so
// "Settings" is the menu's, not some other string with the same text.
const FIRST = ["nav", "assistant", "schedule", "patients", "patientDetail", "payments", "paymentsPage", "settings", "clinics", "secretary", "subscription"];

// The labels the English Help and App Map name: **bold** text and screen
// paths, split at the arrows.
function mentionedLabels(): string[] {
  const out = new Set<string>();
  const addPath = (s: string) => {
    for (const part of s.split(/\s*[→›]\s*/)) {
      const p = part.trim();
      if (p.length >= 2 && p.length <= 40) out.add(p);
    }
  };
  const addText = (s: string) => {
    for (const m of s.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) addPath(m[1]);
  };
  for (const c of HELP) {
    for (const a of c.articles) {
      for (const b of a.body.en ?? []) (b.type === "ol" ? b.items : [b.text]).forEach(addText);
      if (a.web?.en) addText(a.web.en);
      if (a.appOnly?.en) addText(a.appOnly.en);
    }
  }
  for (const a of ACTIONS) {
    addPath(a.screen.app.en);
    if (a.screen.web) addPath(a.screen.web.en);
  }
  return [...out];
}

function leaves(o: unknown, path: string[] = [], out: [string[], string][] = []): [string[], string][] {
  if (typeof o === "string") out.push([path, o]);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) leaves(v, [...path, k], out);
  return out;
}

// English label (lowercase) → its message path, screens' namespaces first.
let index: Map<string, string[]> | null = null;
function labelIndex(): Map<string, string[]> {
  if (index) return index;
  const rank = (p: string[]) => {
    const i = FIRST.indexOf(p[0]);
    return i < 0 ? FIRST.length : i;
  };
  const all = leaves(en)
    .filter(([, v]) => v.length <= 40 && !v.includes("{"))
    .sort((a, b) => rank(a[0]) - rank(b[0]));
  index = new Map();
  for (const [p, v] of all) {
    const key = v.replace(/\s*✓\s*$/, "").trim().toLowerCase();
    if (!index.has(key)) index.set(key, p);
  }
  return index;
}

const cache = new Map<string, string[]>();

// `"English" = "ภาษาไทย"` pairs for the labels the Help and App Map name;
// empty for pt/en, which the articles already use.
export function labelGlossary(locale: string, messages: Messages): string[] {
  if (locale === "en" || locale === "pt-BR") return [];
  const hit = cache.get(locale);
  if (hit) return hit;
  const idx = labelIndex();
  const pairs: string[] = [];
  for (const label of mentionedLabels()) {
    const path = idx.get(label.toLowerCase());
    if (!path) continue;
    const value = path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), messages);
    if (typeof value !== "string") continue;
    const local = value.replace(/\s*✓\s*$/, "").trim();
    if (local && local.toLowerCase() !== label.toLowerCase()) pairs.push(`"${label}" = "${local}"`);
  }
  cache.set(locale, pairs);
  return pairs;
}
