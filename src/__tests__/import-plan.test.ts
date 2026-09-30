import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, parseCsv } from "@/lib/import/csv";
import { buildRows, detectSource, normalizeHeader, planColumns, separateNames } from "@/lib/import/plan";

// The patient import's parsing and column plan (presets from mobile
// feat/import-presets; the database normalises every value).

describe("reading a CSV", () => {
  it("UTF-8, else Windows-1252 (Brazilian exports are often Latin-1); the BOM is dropped", () => {
    expect(decodeText(new TextEncoder().encode("﻿Nome;Profissão\n"))).toEqual({ text: "Nome;Profissão\n", encoding: "utf-8" });
    // "Profissão" in Latin-1: ã = 0xE3.
    const latin = new Uint8Array([...new TextEncoder().encode("Profiss"), 0xe3, 0x6f]);
    expect(decodeText(latin)).toEqual({ text: "Profissão", encoding: "windows-1252" });
  });

  it("finds the delimiter and reads quotes, doubled quotes and newlines in quotes", () => {
    const text = 'Nome;Obs\n"Silva; Maria";"disse ""oi""\nna consulta"\r\nJoão;\n\n';
    expect(detectDelimiter(text)).toBe(";");
    expect(parseCsv(text, ";")).toEqual([["Nome", "Obs"], ["Silva; Maria", 'disse "oi"\nna consulta'], ["João", ""]]);
    expect(detectDelimiter("name,birth_date,cpf\nAna,1990-01-02,123\n")).toBe(",");
  });
});

describe("the source (the presets README; 38's reference cases, __tests__/lib/import-presets.test.ts)", () => {
  it("an ordinary Brazilian sheet with Mãe / CNS is generic, not Prontuário Verde", () => {
    expect(detectSource(["Nome", "Nascimento", "Mãe", "CNS", "Telefone", "E-mail"], "pacientes.csv")).toBe("generic");
    expect(detectSource(["Nome", "Nascimento", "Prontuário"], "pacientes.csv")).toBe("generic");
    // File names match exactly (case-sensitive): an ordinary sheet saved as paciente.csv is not PV.
    expect(detectSource(["Nome", "Telefone"], "paciente.csv")).toBe("generic");
  });
  it("a real Prontuário Verde export: its ids, \"Prontuário\" with Telefone1, or PACIENTE.csv", () => {
    expect(detectSource(["PAC_ID", "CLI_ID", "Nome", "Nascimento", "Sexo", "Telefone1", "Mãe", "CNS"])).toBe("prontuario_verde");
    expect(detectSource(["Nome", "Nascimento", "Prontuário", "Telefone1"])).toBe("prontuario_verde");
    expect(detectSource(["Nome", "Telefone"], "PACIENTE.csv")).toBe("prontuario_verde");
  });
  it("an ordinary English sheet with cns / indication is generic, not iClinic; patient.csv alone too", () => {
    expect(detectSource(["name", "birth_date", "cns", "indication", "patient_code"], "patients.csv")).toBe("generic");
    expect(detectSource(["name", "phone"], "patient.csv")).toBe("generic");
  });
  it("a real iClinic export: civil_name / social_gender, or patient.csv inside the ZIP", () => {
    expect(detectSource(["name", "birth_date", "civil_name", "cns"])).toBe("iclinic");
    expect(detectSource(["name", "birth_date", "social_gender"])).toBe("iclinic");
    expect(detectSource(["whatever"], "export.zip", ["patient.csv"])).toBe("iclinic");
  });
});

describe("unlisted columns and the header match", () => {
  it("a system preset's unlisted column takes generic's suggestion (Telefone / E-mail / CPF) unless the preset fills that field", () => {
    const plan = planColumns("prontuario_verde", ["PAC_ID", "Nome", "Nascimento", "Telefone", "E-mail", "Convênio"]);
    const at = (h: string) => plan.find((c) => c.header === h)!;
    expect([at("Telefone").field, at("E-mail").field]).toEqual(["phone", "email"]);
    expect(at("Convênio")).toMatchObject({ kind: "extra", label: "Convênio" });
    // Telefone1 is PV's own phone column: an extra "Telefone" stays imported data.
    const own = planColumns("prontuario_verde", ["PAC_ID", "Nome", "Telefone1", "Telefone"]);
    expect(own.find((c) => c.header === "Telefone")).toMatchObject({ kind: "extra" });
  });

  it("only Latin accents go (Thai marks stay); º reads as o", () => {
    expect(normalizeHeader("Profissão")).toBe("profissao");
    expect(normalizeHeader("Nº de identidade tailandês")).toBe("no de identidade tailandes");
    expect(normalizeHeader("ชื่อ-นามสกุล")).toBe("ชื่อ นามสกุล");
    expect(planColumns("generic", ["Nº de identidade tailandês", "ชื่อ-นามสกุล"]).map((c) => c.field)).toEqual(["th_national_id", "full_name"]);
  });
});

describe("the column plan", () => {
  it("generic: suggestions by header (case, accents, punctuation ignored); extras by alias; the rest kept as imported data", () => {
    expect(normalizeHeader("  Data de Nascimento ")).toBe("data de nascimento");
    expect(normalizeHeader("E-mail")).toBe("e mail");
    const plan = planColumns("generic", ["Nome completo", "DATA DE NASCIMENTO", "Celular", "Telefone", "CEP", "Plano"]);
    expect(plan.map((c) => [c.kind, c.field ?? c.label])).toEqual([
      ["field", "full_name"], ["field", "birth_date"], ["field", "phone"],
      // A second phone column: the field is already taken, so it's kept.
      ["extra", "Telefone"], ["extra", "CEP"], ["extra", "Plano"],
    ]);
  });

  it("iClinic: the preset's rules; an unlisted column is kept; sensitive ones are off by default", () => {
    const plan = planColumns("iclinic", ["name", "civil_name", "ethnicity", "tag_physician_id", "favorite_color"]);
    expect(plan[0]).toMatchObject({ kind: "field", field: "full_name", priority: 2, elseExtra: "Nome social" });
    expect(plan[2]).toMatchObject({ kind: "extra", label: "Raça/cor", sensitive: true });
    expect(plan[3]).toMatchObject({ kind: "ignore" });
    expect(plan[4]).toMatchObject({ kind: "extra", label: "favorite_color" });
  });
});

describe("first and last name in separate columns (UX: joined by default)", () => {
  it("Nome + Sobrenome, ชื่อ + นามสกุล, First + Last name: one full name, empty parts skipped", () => {
    for (const [a, b] of [["Nome", "Sobrenome"], ["ชื่อ", "นามสกุล"], ["First name", "Last name"]]) {
      const plan = planColumns("generic", [a, b, "CPF"]);
      expect(plan.map((c) => c.namePart)).toEqual(["first", "last", undefined]);
      expect(buildRows(plan, [["Maria", "Silva", ""], ["", "Souza", ""], ["", "", "123"]])).toEqual([
        { row: 2, full_name: "Maria Silva" }, { row: 3, full_name: "Souza" }, { row: 4, cpf: "123" },
      ]);
    }
  });

  it("not when the file also has a full-name column; \"Usar colunas separadas\" keeps the first as the name, the last as imported data", () => {
    expect(planColumns("generic", ["Nome completo", "Nome", "Sobrenome"]).some((c) => c.namePart)).toBe(false);
    const split = separateNames(planColumns("generic", ["Nome", "Sobrenome"]));
    expect(buildRows(split, [["Maria", "Silva"]])).toEqual([{ row: 2, full_name: "Maria", extra: { Sobrenome: "Silva" } }]);
  });
});

describe("the rows", () => {
  const headers = ["name", "civil_name", "gender", "mobile_phone", "home_phone", "tag_names", "died", "active", "ethnicity", "marital_status", "birth_date", "patientrelatedness_mother_names"];
  const plan = planColumns("iclinic", headers);

  it("routes cells: priorities (the loser kept as an extra), codes, splits; the line number is the sheet's", () => {
    const rows = buildRows(plan, [["Ana", "Ana Maria Souza", "f", "", "(11) 3000-0000", "vip~retorno", "0", "1", "br", "ma", "1990-01-02", "Rosa~Lia"]]);
    expect(rows[0]).toEqual({
      row: 2,
      full_name: "Ana Maria Souza",
      sex: "female",
      phone: "(11) 3000-0000",
      tags: ["vip", "retorno"],
      birth_date: "1990-01-02",
      // Sensitive (race/colour) left out by default; codes become labels.
      extra: { "Nome social": "Ana", "Estado civil": "Casado(a)", "Nome da mãe": "Rosa, Lia" },
    });
  });

  it("archived: an active patient carries no key; inactive or deceased (deceased wins); unmapped codes send nothing", () => {
    const at = (died: string, active: string) => buildRows(plan, [["X", "", "", "", "", "", died, active, "", "", "", ""]])[0].archived;
    expect(at("0", "1")).toBeUndefined();
    expect(at("0", "0")).toBe("inactive");
    expect(at("1", "0")).toBe("deceased");
    expect(at("1", "1")).toBe("deceased");
    expect(at("x", "?")).toBeUndefined();
  });

  it("a sensitive column the doctor switched on is sent; a code mapped to null sends nothing", () => {
    const kept = plan.map((c) => (c.header === "ethnicity" ? { ...c, keep: true } : c));
    expect(buildRows(kept, [["X", "", "", "", "", "", "", "", "br", "", "", ""]])[0].extra).toEqual({ "Raça/cor": "Parda" });
  });

  it("an Excel date serial stays a number for birth_date; other numbers become text; empty cells are left out", () => {
    const g = planColumns("generic", ["Nome", "Nascimento", "CPF"]);
    expect(buildRows(g, [["Bia", 32874, 12345678909], ["Caio", "", ""]], 5)).toEqual([
      { row: 5, full_name: "Bia", birth_date: 32874, cpf: "12345678909" },
      { row: 6, full_name: "Caio" },
    ]);
  });
});

describe("reading the file", async () => {
  const XLSX = await import("xlsx");
  const { readSpreadsheet, MAX_IMPORT_ROWS } = await import("@/lib/import/readFile");

  it("XLSX: the first sheet; a date cell stays its serial; text keeps leading zeros; numbers as shown", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Nome", "Nascimento", "CPF", "Telefone"], ["Ana", 32875, "01234567890", 11987654321]]);
    // A date-formatted cell (1990-01-02), as Excel saves one.
    ws.B2.z = "dd/mm/yyyy";
    const bytes = XLSX.write({ SheetNames: ["P"], Sheets: { P: ws } }, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = readSpreadsheet(new Uint8Array(bytes), "pacientes.xlsx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.headers).toEqual(["Nome", "Nascimento", "CPF", "Telefone"]);
    expect(r.rows[0][0]).toBe("Ana");
    expect(r.rows[0][1]).toBe(32875); // 1990-01-02 as an Excel serial
    expect(r.rows[0][2]).toBe("01234567890");
    expect(r.rows[0][3]).toBe("11987654321");
  });

  it("long numbers in General format stay whole (not 5.51199E+12); a custom format keeps what the sheet shows", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Nome", "Celular", "CNS", "CPF"], ["Ana", 5511987654321, 123456789012345, 1234567890]]);
    ws.D2.z = "00000000000"; // a CPF formatted to keep its leading zero
    const bytes = XLSX.write({ SheetNames: ["P"], Sheets: { P: ws } }, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = readSpreadsheet(new Uint8Array(bytes), "p.xlsx");
    expect(r.ok && r.rows[0].slice(1)).toEqual(["5511987654321", "123456789012345", "01234567890"]);
  });

  it("CSV by extension; ZIP, other types, an empty file and too many rows are refused", () => {
    const csv = new TextEncoder().encode("Nome;CPF\nAna;123\n");
    expect(readSpreadsheet(csv, "x.csv")).toEqual({ ok: true, headers: ["Nome", "CPF"], rows: [["Ana", "123"]], encoding: "utf-8" });
    expect(readSpreadsheet(csv, "x.zip")).toEqual({ ok: false, error: "zip" });
    expect(readSpreadsheet(csv, "x.pdf")).toEqual({ ok: false, error: "unsupported" });
    expect(readSpreadsheet(new TextEncoder().encode("\n\n"), "x.csv")).toEqual({ ok: false, error: "empty" });
    const big = "Nome\n" + "a\n".repeat(MAX_IMPORT_ROWS + 1);
    expect(readSpreadsheet(new TextEncoder().encode(big), "x.csv")).toEqual({ ok: false, error: "too_many_rows" });
  });
});
