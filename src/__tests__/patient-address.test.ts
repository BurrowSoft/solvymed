import { describe, expect, it } from "vitest";
import { ADDRESS_MARKER, addressError, addressLine, isValidCns, readAddress } from "@/lib/patientAddress";

// Migration 138's patient address / CNS / Observações, as the web form reads them.

// A valid CNS: 15 digits, first 1/2/7/8/9, weights 15..1 sum % 11 = 0.
const VALID = "700000000000005"; // 7*15 + 5*1 = 110
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("isValidCns", () => {
  it("follows the official rule", () => {
    expect(isValidCns(VALID)).toBe(true);
    expect(isValidCns("700 0000 0000 0005")).toBe(true);
    expect(isValidCns("700000000000006")).toBe(false);
    expect(isValidCns("300000000000005")).toBe(false); // starts with 3
    expect(isValidCns("70000000000005")).toBe(false); // 14 digits
  });
});

describe("readAddress", () => {
  it("nothing to write when the form didn't show the section", () => {
    expect(readAddress(fd({ address_city: "São Paulo" }), "BR")).toBeNull();
  });

  it("trims, turns empty into null, caps lengths, keeps the CNS as digits (BR only)", () => {
    const cols = readAddress(fd({ [ADDRESS_MARKER]: "1", address_street: "  Rua A ", address_city: "", notes_admin: "x".repeat(2100), cns: "700 0000 0000 0005" }), "BR")!;
    expect(cols.address_street).toBe("Rua A");
    expect(cols.address_city).toBeNull();
    // 1.8.0 C1: a field the form didn't post (hidden) isn't written at all.
    expect(cols).not.toHaveProperty("address_postal_code");
    expect(cols.notes_admin).toHaveLength(2000);
    expect(cols.cns).toBe(VALID);
    expect(addressError(cols)).toBeNull();
    const th = readAddress(fd({ [ADDRESS_MARKER]: "1", cns: VALID }), "TH")!;
    expect(th).not.toHaveProperty("cns");
    expect(addressError(readAddress(fd({ [ADDRESS_MARKER]: "1", cns: "123" }), "BR"))).toBe("invalid_cns");
    expect(readAddress(fd({ [ADDRESS_MARKER]: "1", cns: " " }), "BR")!.cns).toBeNull();
  });
});

describe("addressLine", () => {
  const full = { address_street: "Rua X", address_number: "123", address_complement: "apto 4", address_neighborhood: "Bairro", address_city: "Cidade", address_state: "UF", address_postal_code: "01234-567" };
  it("in the practice country's order (UX), skipping empty parts", () => {
    expect(addressLine(full, "BR")).toBe("Rua X, 123, apto 4 – Bairro – Cidade/UF – CEP 01234-567");
    expect(addressLine({ ...full, address_complement: null, address_neighborhood: "", address_postal_code: null }, "BR")).toBe("Rua X, 123 – Cidade/UF");
    expect(addressLine({ address_number: "99/1", address_street: "ซอยสุขุมวิท 11", address_neighborhood: "คลองเตยเหนือ", address_city: "วัฒนา", address_state: "กรุงเทพมหานคร", address_postal_code: "10110" }, "TH"))
      .toBe("99/1, ซอยสุขุมวิท 11, คลองเตยเหนือ, วัฒนา, กรุงเทพมหานคร, 10110");
    expect(addressLine(full, "PT")).toBe("Rua X, 123, apto 4 – Bairro – Cidade, UF – 01234-567");
  });

  it("nothing unless the street or the city is filled", () => {
    expect(addressLine({ address_postal_code: "01234-567", address_state: "SP" }, "BR")).toBe("");
    expect(addressLine({ address_city: "Nan" }, "TH")).toBe("Nan");
    expect(addressLine({}, "BR")).toBe("");
  });
});
