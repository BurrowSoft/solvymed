import { describe, expect, it } from "vitest";
import {
  formIdKindMatches,
  isValidThaiId,
  patientIdError,
  patientIdKind,
  readPatientIds,
  sameIdentifier,
  similarPatientArgs,
} from "@/lib/patientIds";

// Shared with the app (mobile lib/country tests): the same vectors, so both
// clients agree with the database's 'invalid_th_id' check (migration 110).
const VALID_THAI_IDS = ["1101700207030", "3100503389475", "1234567890121"];
const INVALID_THAI_IDS = ["1101700207031", "3100503389470", "123456789012", "12345678901234", "abcdefghijklm", ""];

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("isValidThaiId", () => {
  it("accepts valid IDs, with or without dashes/spaces", () => {
    for (const id of VALID_THAI_IDS) expect(isValidThaiId(id)).toBe(true);
    expect(isValidThaiId("1-1017-00207-03-0")).toBe(true);
    expect(isValidThaiId("1 1017 00207 03 0")).toBe(true);
  });

  it("rejects a wrong check digit or length", () => {
    for (const id of INVALID_THAI_IDS) expect(isValidThaiId(id)).toBe(false);
  });
});

describe("readPatientIds (only the practice country's columns)", () => {
  const fd = form({ cpf: " 123.456.789-09 ", th_national_id: "1-1017-00207-03-0", passport_number: " AB123456 " });

  it("Brazil writes CPF only (exactly as before migration 110)", () => {
    expect(readPatientIds(fd, "BR")).toEqual({ cpf: "123.456.789-09" });
  });

  it("Thailand writes the Thai ID (digits) and passport, never CPF", () => {
    expect(readPatientIds(fd, "TH")).toEqual({ th_national_id: "1101700207030", passport_number: "AB123456" });
  });

  it("Other writes the passport/ID only", () => {
    expect(readPatientIds(fd, "OTHER")).toEqual({ passport_number: "AB123456" });
  });

  it("empty values are null, and the passport is capped at 30", () => {
    expect(readPatientIds(form({}), "TH")).toEqual({ th_national_id: null, passport_number: null });
    const long = readPatientIds(form({ passport_number: "X".repeat(40) }), "OTHER") as { passport_number: string };
    expect(long.passport_number).toHaveLength(30);
  });

  it("the kind follows the country; unknown is Brazil", () => {
    expect(patientIdKind("TH")).toBe("TH");
    expect(patientIdKind("PT")).toBe("OTHER");
    expect(patientIdKind(null)).toBe("BR");
  });
});

describe("validation and duplicates", () => {
  it("flags an invalid Thai ID before saving", () => {
    expect(patientIdError({ th_national_id: "1101700207031", passport_number: null })).toBe("invalid_th_id");
    expect(patientIdError({ th_national_id: "1101700207030", passport_number: null })).toBeNull();
    expect(patientIdError({ cpf: "x" })).toBeNull();
  });

  it("find_similar_patients gets only the identifiers that are set", () => {
    expect(similarPatientArgs({ cpf: "123" })).toEqual({ p_cpf: "123" });
    expect(similarPatientArgs({ cpf: null })).toEqual({});
    expect(similarPatientArgs({ th_national_id: "1101700207030", passport_number: null })).toEqual({ p_th_national_id: "1101700207030" });
    expect(similarPatientArgs({ passport_number: "AB1" })).toEqual({ p_passport_number: "AB1" });
  });

  it("picks the row whose identifier collided", () => {
    expect(sameIdentifier({ cpf: "123.456.789-09" }, { cpf: "12345678909" })).toBe(true);
    expect(sameIdentifier({ th_national_id: "1101700207030", passport_number: null }, { th_national_id: "1101700207030" })).toBe(true);
    expect(sameIdentifier({ passport_number: "ab-123 456" }, { passport_number: "AB123456" })).toBe(true);
    expect(sameIdentifier({ passport_number: "AB1" }, { passport_number: "AB2" })).toBe(false);
  });
});

describe("formIdKindMatches", () => {
  it("accepts a form rendered for the practice's kind", () => {
    for (const kind of ["BR", "TH", "OTHER"] as const) {
      expect(formIdKindMatches(form({ id_kind: kind }), kind)).toBe(true);
    }
  });

  it("refuses a Thai practice's save from a form that showed only CPF", () => {
    // The page fell back to BR on a transient error; saving as TH would
    // write NULL over the stored Thai ID and passport.
    expect(formIdKindMatches(form({ id_kind: "BR", cpf: "12345678909" }), "TH")).toBe(false);
  });

  it("refuses a form with no id_kind (fails closed)", () => {
    expect(formIdKindMatches(form({ full_name: "A" }), "BR")).toBe(false);
    expect(formIdKindMatches(form({ id_kind: "" }), "OTHER")).toBe(false);
  });
});
