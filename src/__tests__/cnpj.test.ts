import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";

// The app's vectors, verbatim (mobile fix/clinic-state-label e855697,
// __tests__/lib/country.test.ts "CNPJ (a Brazilian clinic, UX)").

describe("CNPJ (a Brazilian clinic, UX)", () => {
  it("accepts numeric and alphanumeric CNPJs, masked or not", () => {
    for (const v of ["11.222.333/0001-81", "11222333000181", "12.ABC.345/01DE-35", "12.abc.345/01de-35"]) expect(isValidCnpj(v), v).toBe(true);
  });

  it("refuses wrong check digits, short values, repeated characters and letters in the check digits", () => {
    for (const v of ["11.222.333/0001-82", "11.222.333/0001-8", "00.000.000/0000-00", "12.ABC.345/01DE-36", "12.ABC.345/01DE-3X"]) expect(isValidCnpj(v), v).toBe(false);
  });

  it("formats with the mask, letters upper-cased; anything else stays", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(formatCnpj("123")).toBe("123");
  });
});
