import type { Currency } from "./country";

// Appointment and procedure amounts are stored in the practice's currency
// (its country decides it: lib/country). Each currency is shown in its own
// convention: "R$ 150,00", "฿150.00", "$150.00".
const LOCALE: Record<Currency, string> = { BRL: "pt-BR", THB: "th-TH", USD: "en-US" };
const formatters = new Map<Currency, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: Currency = "BRL"): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[currency], { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f.format(amount);
}

// A money input's label and example follow the practice currency (UX):
// "Preço (R$)" / "0,00" in Brazil, "(฿)" / "0.00" in Thailand, "($)" / "0.00"
// elsewhere. parseMoney reads either decimal style.
const SYMBOL: Record<Currency, string> = { BRL: "R$", THB: "฿", USD: "$" };
// No default: the caller always passes the PRACTICE currency (9a: a default
// would silently pick one country's convention).
export function currencySymbol(currency: Currency): string {
  return SYMBOL[currency];
}
// The example amount in the currency's own decimal style.
const EXAMPLE: Record<Currency, string> = { BRL: "0,00", THB: "0.00", USD: "0.00" };
export function amountExample(currency: Currency): string {
  return EXAMPLE[currency];
}

/** @deprecated use formatMoney(amount, currency): kept for BRL-only call sites. */
export function formatBRL(amount: number): string {
  return formatMoney(amount, "BRL");
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
