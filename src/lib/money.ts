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

/** @deprecated use formatMoney(amount, currency): kept for BRL-only call sites. */
export function formatBRL(amount: number): string {
  return formatMoney(amount, "BRL");
}
