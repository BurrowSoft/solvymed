// How a professional's name is shown with a greeting or to patients: the
// same rule as the app (mobile lib/doctor-name.ts, one shared case table).
// A title the doctor typed (Dr, Dra, Prof, Profa, Pr, Dott, Dott.ssa, with
// or without a dot) is kept and normalised ("Dra.", "Dott.ssa"); we never
// add one ourselves, since that would guess gender (UX's neutral-copy
// rule). The same regex as the app's; change both together.
const TITLE = /^(dott\.ssa|dott|dra|dr|profa|prof|pr)(?:\.\s*|\s+|$)/i;

export function doctorDisplayName(name: string | null | undefined, opts: { firstOnly?: boolean } = {}): string {
  const s = (name ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const m = s.match(TITLE);
  const word = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
  const title = word ? (word.includes(".") ? word : `${word}.`) : null;
  const rest = m ? s.slice(m[0].length).trim() : s;
  const shown = opts.firstOnly ? rest.split(" ")[0] ?? "" : rest;
  return [title, shown].filter(Boolean).join(" ");
}

// The avatar letter: the name's, not the title's ("Dra. Beatriz" → "B").
export function nameInitial(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  const rest = s.replace(TITLE, "").trim() || s;
  return rest.charAt(0).toUpperCase();
}
