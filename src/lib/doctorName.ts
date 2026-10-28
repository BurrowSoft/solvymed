// How a professional's name is shown with a greeting or to patients: the
// same rule as the app (mobile lib/doctor-name.ts, one shared case table).
// A title the doctor typed is kept in their own spelling, only the case
// tidied ("dr carlos" → "Dr carlos", "DOTT.SSA" → "Dott.ssa"), with or
// without a dot, including the Brazilian ordinal ("Drª", "Dr.ª", "Drª.").
// Several leading titles are all kept ("Prof. Dr. Carlos Melo"). We never
// add a title ourselves: it would guess gender (UX's neutral-copy rule).
// The titles are the ones the name field's hint suggests: Dr/Dra/Prof/Profa
// (+ ª forms), fr Pr, it Dott./Dott.ssa. The same regex as the app's;
// change both together.
import { THAI_TITLES } from "./country";

const TITLE = /^(dott\.ssa|dott|dra|dr|profa|prof|pr)(?:(\.?ª\.?|\.)\s*|\s+|$)/i;
const MAX_TITLES = 3;

// Every supported country's titles (the Latin ones above; the Thai ones,
// THAI_TITLE_LOOSE below, with or without the dot). A Thai title is written with its dot, against the name, the
// usual Thai form (01, both platforms; the app's #517): "นพ. ธีรวัฒน์" and
// "นพ ธีรวัฒน์" → "นพ.ธีรวัฒน์".
type Title = { text: string; attached: boolean };

function splitTitles(name: string | null | undefined): { titles: Title[]; rest: string } {
  let rest = (name ?? "").trim().replace(/\s+/g, " ");
  const titles: Title[] = [];
  while (titles.length < MAX_TITLES) {
    const thai = rest.match(THAI_TITLE_LOOSE);
    const m = thai ? null : rest.match(TITLE);
    if (thai) titles.push({ text: `${thai[1]}.`, attached: true });
    else if (m) titles.push({ text: `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}${m[2] ?? ""}`, attached: false });
    else break;
    rest = rest.slice((thai ?? m)![0].length);
  }
  return { titles, rest: rest.trim() };
}

// Titles then the name: the titles space-separated; the last one against
// the name when it's Thai ("ดร. นพ.สมชาย", the app's #517), else a space.
function joinTitles(titles: Title[], name: string): string {
  const head = titles.map((t) => t.text).join(" ");
  if (!name) return head;
  if (!head) return name;
  return `${head}${titles[titles.length - 1].attached ? "" : " "}${name}`;
}

export function doctorDisplayName(name: string | null | undefined, opts: { firstOnly?: boolean } = {}): string {
  const { titles, rest } = splitTitles(name);
  const shown = opts.firstOnly ? rest.split(" ")[0] ?? "" : rest;
  return joinTitles(titles, shown);
}

// Thai professional titles: the ones the practice-country examples suggest
// (lib/country THAI_TITLES, one list; 9a), plus ภก./ภญ./ดร. At the start of
// a name, with its dot or, without one, followed by a space ("นพ.สมชาย",
// "พญ. สุดา", "นพ สมชาย"; never "ดร" inside "ดรุณี"). Longest first, so
// "ทพญ." isn't read as "ทพ." + "ญ." (app #309's list). The one Thai-title
// rule here: splitTitles, then every function above and below.
const THAI_TITLE_LOOSE = new RegExp(
  `^(${[...THAI_TITLES, "ทพญ.", "ภก.", "ภญ.", "ดร."].map((s) => s.replace(/\.$/, "")).sort((a, b) => b.length - a.length).join("|")})(?:\\.\\s*|\\s+)`,
);

// The brand's name with its chosen title (1.5.0 My brand; e7, both
// platforms): when a Título is set, any title the name already starts with
// (Dr, Dra., Drª, Prof., นพ., พญ.…, with or without the dot, any case) is
// dropped, then the Título is put in front once: "Dra." + "Dra Ana Lima" →
// "Dra. Ana Lima". No Título: the name as it is. A Thai title ending in a
// dot is written against the name ("นพ.สมชาย"), the usual Thai style.
export function withBrandTitle(title: string | null | undefined, name: string | null | undefined): string {
  const t = (title ?? "").trim();
  let rest = (name ?? "").trim().replace(/\s+/g, " ");
  if (!t) return rest;
  for (let i = 0; i < MAX_TITLES; i++) {
    const thai = rest.match(THAI_TITLE_LOOSE);
    const latin = thai ? null : rest.match(TITLE);
    const m = thai ?? latin;
    if (!m) break;
    rest = rest.slice(m[0].length).trim();
  }
  if (!rest) return t;
  const attached = /^[฀-๿].*\.$/.test(t);
  return attached ? `${t}${rest}` : `${t} ${rest}`;
}

// For a greeting (UX, "Olá, Dra. Ana!", "เรียน นพ.สมชาย"): the typed
// title(s), as doctorDisplayName shows them (a Thai one with its dot), and
// the first name. Never a title we add. The message puts them together
// (th: "เรียน {title}{name}", against the name).
export function greetingName(name: string | null | undefined): { title: string; first: string } {
  const { titles, rest } = splitTitles(name);
  return { title: joinTitles(titles, ""), first: rest.split(" ")[0] ?? "" };
}

// For a button ("Marcar consulta com Dra. Ana Lima"; e7): the typed
// title(s), the first and the last name, so a long full name fits (the
// button also wraps to 2 lines, then ellipsis). A Thai title against the
// name, as everywhere ("นพ.สมชาย ใจดี"; 01).
export function shortDoctorName(name: string | null | undefined): string {
  const { titles, rest } = splitTitles(name);
  const parts = rest.split(" ").filter(Boolean);
  const names = parts.length > 2 ? [parts[0], parts[parts.length - 1]] : parts;
  return joinTitles(titles, names.join(" "));
}

// The avatar letter: the name's, never a title's ("Dra. Beatriz" → "B",
// "Prof. Dr. carlos" → "C"); a bare title keeps its own letter. The Thai
// honorific หมอ / คุณหมอ (typed with the name, "หมอสมชาย") is skipped too, as
// brandInitials does (launch polish 35; WT1's TH rehearsal, 10-28). Only for
// the letter: greetings keep the name as typed.
export function nameInitial(name: string | null | undefined): string {
  const { titles, rest } = splitTitles(name);
  const bare = rest.replace(/^(?:คุณหมอ|หมอ)\s*/, "");
  return Array.from(bare || rest || titles[0]?.text || "")[0]?.toUpperCase() ?? "";
}

// The first name to greet the signed-in user with: their own, or none
// ("Good evening!") when it's empty or just their email's local part
// (Vitor's secretary test: "Good evening, Here66443"; UX).
export function greetingFirstName(name: string | null | undefined, email: string | null | undefined): string {
  const shown = doctorDisplayName(name, { firstOnly: true });
  const local = (email ?? "").split("@")[0].trim().toLowerCase();
  if (!shown || (local && (name ?? "").trim().toLowerCase() === local)) return "";
  return shown;
}
