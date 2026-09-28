// Appointment and procedure amounts are stored in BRL. Shown the way the
// dashboard and payments pages already show them ("R$ 150,00").
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(amount: number): string {
  return BRL.format(amount);
}

// The largest amount the server accepts (payments/actions isValidAmount).
export const MAX_AMOUNT = 1_000_000;

// A typed amount → a number, the same rule as the app's parseAmount (one
// shared test table). <input type="number"> can't be trusted for this:
// Chrome reads "150,50" as 15050. The rule:
// - currency symbols, letters and spaces are ignored ("R$ 150,50");
// - the LAST separator ("," or ".") followed by 1–2 digits is the decimal
//   separator ("150,50", "150.5", "1.500,50", "1,500.50");
// - a separator followed by exactly 3 digits groups thousands ("1.500",
//   "1,500,000"); groups must be 3 digits, the first 1–3;
// - anything else (a minus sign, 3+ decimals, mixed-up groups, more than
//   2 decimals, above MAX_AMOUNT) is null: the caller shows an error and
//   never falls back to another value.
export function parseMoney(text: string | null | undefined): number | null {
  const raw = (text ?? "").trim();
  if (raw.includes("-")) return null;
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s || !/\d/.test(s)) return null;

  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let intPart = s;
  let decPart = "";
  if (last >= 0) {
    const tail = s.slice(last + 1);
    if (/^\d{1,2}$/.test(tail)) {
      intPart = s.slice(0, last);
      decPart = tail;
      // The decimal separator appears once; the other one only groups.
      if (intPart.includes(s[last])) return null;
    } else if (!/^\d{3}$/.test(tail)) {
      return null;
    }
  }

  // intPart: plain digits, or thousands groups with a single separator kind.
  let digits: string;
  if (/^\d+$/.test(intPart)) {
    digits = intPart;
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(intPart) && !(intPart.includes(".") && intPart.includes(","))) {
    digits = intPart.replace(/[.,]/g, "");
  } else if (intPart === "" && decPart) {
    digits = "0";
  } else {
    return null;
  }

  const value = Number(`${digits}.${decPart || "0"}`);
  if (!Number.isFinite(value) || value > MAX_AMOUNT) return null;
  return Math.round(value * 100) / 100;
}
