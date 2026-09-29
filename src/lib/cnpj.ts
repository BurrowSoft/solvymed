// A Brazilian clinic's CNPJ, the same rule as the app (mobile lib/country.ts,
// isValidCnpj / formatCnpj): 14 characters, the first 12 digits or (since
// July 2026, IN RFB 2.229/2024) upper-case letters, the last 2 numeric check
// digits. Each character counts as its code minus 48 (A = 17), with the
// usual weights and mod-11 rule. Mask characters allowed; repeated
// characters (00.000.000/0000-00) are not a CNPJ.

// Without its mask, upper-cased (letters kept: the alphanumeric CNPJ).
function cnpjChars(value: string): string {
  return value.replace(/[.\/\s-]/g, "").toUpperCase();
}

export function isValidCnpj(value: string): boolean {
  const c = cnpjChars(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + val(c[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(c[12]) && check(13) === Number(c[13]);
}

// 11.222.333/0001-81, or 12.ABC.345/01DE-35 (alphanumeric); anything that
// isn't 14 characters stays as it was.
export function formatCnpj(value: string): string {
  const c = cnpjChars(value);
  if (!/^[0-9A-Z]{14}$/.test(c)) return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
