import { describe, expect, it } from "vitest";
import { buildRows, detectSource, importFields, planColumns, presetFor, type ImportCap } from "@/lib/import/plan";
import { templateCsv } from "@/lib/import/template";

// Presets v3 (139: the address parts + CNS as fields) carry "requires":
// ["import-address"]: without that capability the importer keeps using v2,
// where the same columns stay imported data, so 130's old validator never
// sees row keys it refuses (unknown_field).

const CAPS: ImportCap[] = ["import-address"];
const ICLINIC = ["name", "birth_date", "civil_name", "zip_code", "address", "number", "complement", "neighborhood", "city", "state", "cns"];

describe("presets v3 × requires", () => {
  it("picks v3 only with the capability; v2 otherwise", () => {
    expect(presetFor("iclinic").version).toBe(2);
    expect(presetFor("iclinic", CAPS).version).toBe(3);
    expect(presetFor("generic").version).toBe(2);
    expect(presetFor("generic", CAPS).version).toBe(3);
    expect(detectSource(ICLINIC, "patient.csv", ["patient.csv"])).toBe("iclinic");
    expect(detectSource(ICLINIC, "patient.csv", ["patient.csv"], CAPS)).toBe("iclinic");
    expect(importFields()).not.toContain("cns");
    expect(importFields(CAPS)).toContain("address_postal_code");
  });

  it("iClinic: without the capability the address stays imported data; with it, the fields", () => {
    const v2 = planColumns("iclinic", ICLINIC);
    for (const h of ["zip_code", "address", "city", "cns"]) expect(v2.find((c) => c.header === h)?.kind).not.toBe("field");
    const rowV2 = buildRows(v2, [["Ana", "1980-01-01", "", "01310100", "Rua A", "10", "", "Centro", "Santos", "SP", "700000000000005"]])[0];
    expect(Object.keys(rowV2).some((k) => k.startsWith("address_") || k === "cns")).toBe(false);

    const v3 = planColumns("iclinic", ICLINIC, CAPS);
    expect(v3.find((c) => c.header === "zip_code")).toMatchObject({ kind: "field", field: "address_postal_code" });
    expect(v3.find((c) => c.header === "cns")).toMatchObject({ kind: "field", field: "cns" });
    const rowV3 = buildRows(v3, [["Ana", "1980-01-01", "", "01310100", "Rua A", "10", "", "Centro", "Santos", "SP", "700000000000005"]])[0];
    expect(rowV3).toMatchObject({ address_postal_code: "01310100", address_street: "Rua A", address_city: "Santos", address_state: "SP", cns: "700000000000005" });
  });

  it("a generic sheet: CEP / Rua / … / CNS are suggested only with the capability", () => {
    const headers = ["Nome", "CEP", "Rua", "Número", "Bairro", "Cidade", "UF", "CNS", "Observações"];
    expect(planColumns("generic", headers).filter((c) => c.kind === "field").map((c) => c.field)).toEqual(["full_name"]);
    const v3 = planColumns("generic", headers, CAPS);
    expect(v3.filter((c) => c.kind === "field").map((c) => c.field)).toEqual([
      "full_name", "address_postal_code", "address_street", "address_number", "address_neighborhood", "address_city", "address_state", "cns",
    ]);
    // A source's own Observações stays imported data (UX).
    expect(v3.find((c) => c.header === "Observações")?.kind).toBe("extra");
  });

  it("the template's address columns (and CNS for Brazil) only with the capability, and they map themselves", () => {
    const head = (csv: string) => csv.replace(/^﻿/, "").split("\r\n")[0].split(";").map((h) => h.replace(/"/g, ""));
    expect(head(templateCsv("pt-BR", "BR").csv)).not.toContain("CEP");
    const br = head(templateCsv("pt-BR", "BR", true).csv);
    expect(br).toEqual(expect.arrayContaining(["CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "UF", "CNS"]));
    expect(br.at(-1)).toBe("Observações");
    const th = head(templateCsv("th", "TH", true).csv);
    expect(th).not.toContain("CNS");
    const plan = planColumns("generic", th, CAPS);
    expect(plan.filter((c) => c.kind === "field" && c.field?.startsWith("address_")).length).toBe(7);
  });
});
