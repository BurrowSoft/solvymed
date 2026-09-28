import { describe, expect, it } from "vitest";
import { cleanSearchText, pageRange, parsePage, patientSearchFilter } from "@/lib/patientSearch";

describe("patientSearchFilter", () => {
  it("searches the name only for plain text", () => {
    expect(patientSearchFilter("Maria")).toBe('full_name.ilike."*Maria*"');
    expect(patientSearchFilter("João da Silva")).toBe('full_name.ilike."*João da Silva*"');
  });

  it("adds CPF and phone digit matches from 3 digits, tolerating separators", () => {
    expect(patientSearchFilter("123.456")).toBe(
      'full_name.ilike."*123.456*",cpf.imatch."1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5[^0-9]*6",phone.imatch."1[^0-9]*2[^0-9]*3[^0-9]*4[^0-9]*5[^0-9]*6"',
    );
    expect(patientSearchFilter("12")).toBe('full_name.ilike."*12*"');
  });

  it("the digit pattern matches formatted and bare values, not scattered digits", () => {
    const pattern = new RegExp(patientSearchFilter("99999-8888")!.match(/cpf\.imatch\."([^"]+)"/)![1], "i");
    expect(pattern.test("(11) 99999-8888")).toBe(true);
    expect(pattern.test("11999998888")).toBe(true);
    expect(pattern.test("(11) 99939-9888")).toBe(false);
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
