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
const TITLE = /^(dott\.ssa|dott|dra|dr|profa|prof|pr)(?:(\.?ª\.?|\.)\s*|\s+|$)/i;
const MAX_TITLES = 3;

function splitTitles(name: string | null | undefined): { titles: string[]; rest: string } {
  let rest = (name ?? "").trim().replace(/\s+/g, " ");
  const titles: string[] = [];
  for (let m = rest.match(TITLE); m && titles.length < MAX_TITLES; m = rest.match(TITLE)) {
    titles.push(`${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}${m[2] ?? ""}`);
    rest = rest.slice(m[0].length);
  }
  return { titles, rest: rest.trim() };
}

export function doctorDisplayName(name: string | null | undefined, opts: { firstOnly?: boolean } = {}): string {
  const { titles, rest } = splitTitles(name);
  const shown = opts.firstOnly ? rest.split(" ")[0] ?? "" : rest;
  return [...titles, shown].filter(Boolean).join(" ");
}

// The avatar letter: the name's, never a title's ("Dra. Beatriz" → "B",
// "Prof. Dr. carlos" → "C"); a bare title keeps its own letter.
export function nameInitial(name: string | null | undefined): string {
  const { titles, rest } = splitTitles(name);
  return (rest || titles[0] || "").charAt(0).toUpperCase();
}
