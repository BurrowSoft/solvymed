import { describe, expect, it } from "vitest";
import { cleanSearchText, pageRange, parsePage, patientSearchFilter } from "@/lib/patientSearch";

describe("patientSearchFilter", () => {
  it("searches the name only for plain text", () => {
    expect(patientSearchFilter("Maria")).toBe('full_name.ilike."*Maria*"');
    expect(patientSearchFilter("João da Silva")).toBe('full_name.ilike."*João da Silva*"');
  });

  it("adds CPF and phone digit matches from 3 digits, tolerating separators", () => {
    expect(patientSearchFilter("123.456")).toBe(
      'full_name.ilike."*123.456*",phone.imatch."1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5[^0-9]*6",cpf.imatch."1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5[^0-9]*6"',
    );
    expect(patientSearchFilter("12")).toBe('full_name.ilike."*12*"');
  });

  it("the digit pattern matches formatted and bare values, not scattered digits", () => {
    const pattern = new RegExp(patientSearchFilter("99999-8888")!.match(/cpf\.imatch\."([^"]+)"/)![1], "i");
    expect(pattern.test("(11) 99999-8888")).toBe(true);
    expect(pattern.test("11999998888")).toBe(true);
    expect(pattern.test("(11) 99939-9888")).toBe(false);
  });

  it("keeps Thai vowel and tone marks (combining \\p{M}): full Thai names are searchable (d7)", () => {
    for (const name of ["แก้วมณี", "วงศ์สา", "สมชาย ใจดี", "สมศักดิ์ รักษ์ไทย", "นก วงศ์สา"]) {
      expect(cleanSearchText(name)).toBe(name);
      expect(patientSearchFilter(name, "TH")).toContain(`full_name.ilike."*${name}*"`);
    }
    // A TH practice's search still adds the passport clause, marks intact.
    expect(patientSearchFilter("แก้วมณี", "TH")).toBe('full_name.ilike."*แก้วมณี*",passport_number.ilike."*แก้วมณี*"');
  });

  it("Portuguese accents: precomposed and decomposed input both search the stored name", () => {
    expect(cleanSearchText("José Conceição")).toBe("José Conceição");
    // "José" typed with a combining acute (e + U+0301) becomes the precomposed é.
    const decomposed = "José";
    expect(cleanSearchText(decomposed)).toBe("José");
    expect(cleanSearchText(decomposed)).toBe("José".normalize("NFC"));
  });

  it("strips anything that could change the filter's structure", () => {
    const f = patientSearchFilter('a"),id.eq.1,(b*%\\')!;
    expect(f).toBe('full_name.ilike."*a id.eq.1 b*"');
    expect(f).not.toMatch(/[()\\%]/);
    expect(patientSearchFilter("   ")).toBeNull();
    expect(patientSearchFilter(null)).toBeNull();
    expect(cleanSearchText("x".repeat(100))).toHaveLength(60);
  });
});

describe("patientSearchFilter by practice country (TH-1)", () => {
  it("Brazil never names the migration-110 columns", () => {
    const f = patientSearchFilter("123 Maria", "BR")!;
    expect(f).toContain("cpf.imatch");
    expect(f).not.toMatch(/th_national_id|passport_number/);
  });

  it("Thailand searches the Thai ID digits and the passport, not CPF", () => {
    const f = patientSearchFilter("1-1017", "TH")!;
    expect(f).toContain('th_national_id.imatch."1[^0-9]*1[^0-9]*0[^0-9]*1[^0-9]*7"');
    expect(f).toContain('passport_number.ilike."*1-1017*"');
    expect(f).not.toContain("cpf.");
  });

  it("Other searches the passport/ID only (no CPF, no Thai ID)", () => {
    const f = patientSearchFilter("AB123", "OTHER")!;
    expect(f).toContain('passport_number.ilike."*AB123*"');
    expect(f).not.toMatch(/cpf\.|th_national_id/);
  });
});

describe("paging", () => {
  it("parses pages defensively", () => {
    expect(parsePage("3")).toBe(3);
    for (const v of [undefined, null, "", "0", "-1", "1.5", "abc", "9999999"]) expect(parsePage(v)).toBe(1);
  });

  it("maps a page to a 50-row range", () => {
    expect(pageRange(1)).toEqual([0, 49]);
    expect(pageRange(3)).toEqual([100, 149]);
  });
});
