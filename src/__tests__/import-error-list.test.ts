import { describe, expect, it } from "vitest";
import { errorListCsv, lostLeadingZero } from "@/lib/import/errorList";
import type { PreviewRow } from "@/lib/import/api";

// The downloadable error list, and the "Excel dropped the CPF's zero" test.

describe("lostLeadingZero", () => {
  it("9 or 10 digits with only CPF punctuation, as text or a number", () => {
    expect(lostLeadingZero("1234567890")).toBe(true);
    expect(lostLeadingZero(123456789)).toBe(true);
    expect(lostLeadingZero(" 12.345.678-90 ")).toBe(true);
    expect(lostLeadingZero("123.456.789-09")).toBe(false); // 11 digits
    expect(lostLeadingZero("12345678")).toBe(false);
    expect(lostLeadingZero("CPF 1234567890")).toBe(false);
    expect(lostLeadingZero(undefined)).toBe(false);
    expect(lostLeadingZero("")).toBe(false);
  });
});

describe("errorListCsv", () => {
  it("gives each reason its row (for row-dependent text), skips clean rows, neutralises formulas", () => {
    const rows: PreviewRow[] = [
      { row_no: 2, outcome: "new", duplicate_of_row: null, warnings: [], errors: [], input: { full_name: "Ok" } },
      { row_no: 3, outcome: "invalid", duplicate_of_row: null, warnings: ["phone_unverified"], errors: ["cpf_invalid"], input: { full_name: "=Bad", cpf: "1234567890" } },
    ];
    const csv = errorListCsv(rows, { row: "Linha", name: "Nome", reason: "Motivo" },
      (code, row) => `${code}${code === "cpf_invalid" && lostLeadingZero(row.input.cpf) ? "+hint" : ""}`, (n) => `rep ${n}`);
    expect(csv).toBe("﻿\"Linha\";\"Nome\";\"Motivo\"\r\n\"3\";\"'=Bad\";\"cpf_invalid+hint · phone_unverified\"\r\n");
  });
});
