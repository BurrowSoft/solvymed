// A phone number for reading (launch polish 27): "11912340001" → "(11) 91234-0001", "0812340001"
// → "081 234 0001". ONE pure module with no imports: the mobile repo vendors a byte-identical
// copy (pinned by SHA-256 in both repos), so change it in BOTH. Per-country patterns with an
// explicit default (never if-BR/else); a number that fits no pattern is shown as stored.
// Only for display: links (tel:) keep the digits.

type PhoneFormat = {
  // The country's dial code (digits only) and its national trunk prefix ("" or "0").
  dial: string;
  trunk: string;
  // National number length (with the trunk) → pattern, "#" = one digit.
  patterns: Record<number, string>;
};

export const PHONE_FORMATS: Record<string, PhoneFormat> = {
  // Brazil: DDD + 9-digit mobile or 8-digit landline (no trunk prefix written).
  BR: { dial: "55", trunk: "", patterns: { 11: "(##) #####-####", 10: "(##) ####-####" } },
  // Thailand: 0 + 9 digits (mobiles 06/08/09) or 0 + 8 digits (landlines, Bangkok 02).
  TH: { dial: "66", trunk: "0", patterns: { 10: "### ### ####", 9: "## ### ####" } },
};

function apply(pattern: string, digits: string): string {
  let i = 0;
  return pattern.replace(/#/g, () => digits[i++] ?? "");
}

export function formatPhone(raw: string | null | undefined, country: string | null | undefined): string {
  const shown = (raw ?? "").trim();
  const f = country ? PHONE_FORMATS[country.toUpperCase()] : undefined;
  if (!f || !shown) return shown;
  // Only digits, spaces, dots, dashes, parentheses and a leading +: anything else stays as typed.
  if (!/^\+?[\d\s.()-]+$/.test(shown)) return shown;
  let digits = shown.replace(/\D/g, "");
  // An international form of this country's number: back to the national one.
  if (shown.startsWith("+") || (digits.startsWith(f.dial) && f.patterns[digits.length - f.dial.length + f.trunk.length])) {
    if (!digits.startsWith(f.dial)) return shown;
    digits = f.trunk + digits.slice(f.dial.length);
  }
  const pattern = f.patterns[digits.length];
  return pattern ? apply(pattern, digits) : shown;
}
