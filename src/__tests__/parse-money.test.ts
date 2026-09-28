import { describe, expect, it } from "vitest";
import { parseMoney } from "@/lib/money";

// The shared table: web parseMoney and the app's parseAmount must give the
// same result for every row (UX). null = show an error, save nothing.
export const PARSE_MONEY_TABLE: [string, number | null][] = [
  // decimal comma (pt-BR)
  ["150,50", 150.5],
  ["150,5", 150.5],
  ["0,99", 0.99],
  [",50", 0.5],
  ["1.500,50", 1500.5],
  ["1.234.567,89", null], // above the 1,000,000 limit
  ["999.999,99", 999999.99],
  // decimal point (en)
  ["150.50", 150.5],
  ["150.5", 150.5],
  ["1,500.50", 1500.5],
  // thousands only
  ["1.500", 1500],
  ["1,500", 1500],
  ["1.000.000", 1000000],
  ["150", 150],
  ["0", 0],
  // symbols and spaces
  ["R$ 150,50", 150.5],
  ["  150,50  ", 150.5],
  ["฿690", 690],
  ["US$ 19.00", 19],
  // rejected
  ["", null],
  ["abc", null],
  ["-150", null],
  // 3 digits after the only separator = thousands (the "= R$ 150.505,00"
  // preview shows it back)
  ["150,505", 150505],
  ["150.5050", null],
  ["1.50050", null],
  ["1,500,50", null],
  ["1.500.50", null],
  ["1,500.000", null],
  ["15,00,000", null],
  ["1.5.0", null],
  ["1.000.001", null],
];

describe("parseMoney (shared table with the app's parseAmount)", () => {
  it.each(PARSE_MONEY_TABLE)("%j → %j", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
});
