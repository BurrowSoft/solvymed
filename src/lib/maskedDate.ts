// The web's typed dates are dd/mm/yyyy (the order BR and TH both use; Vitor:
// "English ≠ American", no MM/DD anywhere). The text is masked as it's
// typed; the stored value is ISO "YYYY-MM-DD".

// Digits only, slashes inserted: "0510" → "05/10", "05102026" → "05/10/2026".
// A pasted "5/10/2026" keeps its parts ("05/10/2026").
export function formatMaskedDate(input: string): string {
  const parts = input.split(/[/.\-\s]+/);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p)) && parts[2].length === 4) {
    return `${parts[0].padStart(2, "0").slice(-2)}/${parts[1].padStart(2, "0").slice(-2)}/${parts[2]}`;
  }
  const d = input.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// "05/10/2026" → "2026-10-05" when it's a real calendar date; else "".
// A Buddhist-era-looking year (≥ 2400) is passed through as typed so the
// field's guard can say so (it's never converted).
export function isoFromMasked(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || y < 1000) return "";
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > days) return "";
  return `${yyyy}-${mm}-${dd}`;
}

// "2026-10-05" → "05/10/2026"; anything else → "".
export function maskedFromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
