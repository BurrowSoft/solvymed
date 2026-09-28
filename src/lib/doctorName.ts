// How a professional's name is shown with a greeting or to patients: the
// same rule as the app (mobile lib/doctor-name.ts, one shared case table).
// A title the doctor typed (Dr, Dra, Prof, Profa, with or without a dot) is
// kept and normalised ("Dra."); we never add one ourselves, since that
// would guess gender (UX's neutral-copy rule).
const TITLE = /^(dra|dr|profa|prof)(?:\.\s*|\s+|$)/i;

export function doctorDisplayName(name: string | null | undefined, opts: { firstOnly?: boolean } = {}): string {
  const s = (name ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const m = s.match(TITLE);
  const title = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + "." : null;
  const rest = m ? s.slice(m[0].length).trim() : s;
  const shown = opts.firstOnly ? rest.split(" ")[0] ?? "" : rest;
  return [title, shown].filter(Boolean).join(" ");
}
