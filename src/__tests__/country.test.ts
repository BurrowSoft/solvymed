import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { countryProfile, normalizeCountry, profileOfKind, profileOfPhonePrefix, titleExamples } from "@/lib/country";
import { amountExample, currencySymbol, formatMoney } from "@/lib/money";
import { getPracticeCountry, lookupPracticeCountry } from "@/lib/practiceCountry";

describe("countryProfile", () => {
  it("maps BR, TH and everything else", () => {
    expect(countryProfile("BR")).toMatchObject({ currency: "BRL", patientId: "cpf", paymentQr: "pix", defaultTimeZone: "America/Sao_Paulo" });
    expect(countryProfile("th")).toMatchObject({ currency: "THB", patientId: "thai_id", paymentQr: "promptpay", defaultTimeZone: "Asia/Bangkok" });
    // Outside BR/TH the clinic's own currency is unknown: plain numbers (UX).
    for (const c of ["PT", "US", "ZZ"]) expect(countryProfile(c)).toMatchObject({ kind: "OTHER", currency: "NONE", paymentQr: null });
  });

  it("is ONE registry: every country without its own entry gets the explicit default, never BR's or TH's rules", () => {
    for (const c of ["PT", "US", "JP", "ZZ"]) {
      const p = countryProfile(c);
      expect(p.clinicTaxId).toBeNull();
      expect(p.examples).toMatchObject({ titles: null, registration: "registrationPlaceholderOther", clinicName: "clinicNamePlaceholderOther", phone: null, state: null, city: null });
    }
    expect(countryProfile("BR")).toMatchObject({ clinicTaxId: "cnpj", examples: { registration: "registrationPlaceholder", state: "SP", website: "www.example.com.br" } });
    expect(countryProfile("TH")).toMatchObject({ clinicTaxId: "th_tax_id", examples: { titles: { th: "นพ., พญ., ทพ., ทญ.", other: "Dr." }, registration: "registrationPlaceholderTH" } });
  });

  it("title examples: Brazil's, Thailand's in Thai (else Dr.), and null elsewhere (the locale's own list)", () => {
    expect(titleExamples("BR", "en")).toBe("Dr., Dra., Prof.");
    expect(titleExamples("TH", "th")).toBe("นพ., พญ., ทพ., ทญ.");
    expect(titleExamples("TH", "en")).toBe("Dr.");
    expect(titleExamples("ZZ", "th")).toBeNull();
    expect(titleExamples("US", "pt-BR")).toBeNull();
  });

  it("treats a missing or malformed country as BR (every practice before migration 110)", () => {
    for (const c of [null, undefined, "", "Brazil", "B", "12"]) expect(normalizeCountry(c)).toBe("BR");
  });
});

describe("formatMoney", () => {
  // Intl puts a no-break space after "R$"; compare with plain spaces.
  const plain = (s: string) => s.replace(/\s/g, " ");
  it("shows each currency in its own convention", () => {
    expect(plain(formatMoney(150, "BRL"))).toBe("R$ 150,00");
    expect(plain(formatMoney(690, "THB"))).toBe("฿690.00");
    expect(plain(formatMoney(19, "USD"))).toBe("$19.00");
    expect(plain(formatMoney(150))).toBe("R$ 150,00");
  });

  it("a practice outside BR/TH: plain numbers, no symbol; Thai money in its own format whatever the UI", () => {
    expect(formatMoney(1500.5, "NONE")).toBe("1,500.50");
    expect([currencySymbol("NONE"), amountExample("NONE")]).toEqual(["", "0.00"]);
    expect(plain(formatMoney(1500.5, "THB"))).toBe("฿1,500.50");
  });

  it("a money input's symbol and example follow the currency (0,00 only for BRL)", () => {
    expect([currencySymbol("BRL"), amountExample("BRL")]).toEqual(["R$", "0,00"]);
    expect([currencySymbol("THB"), amountExample("THB")]).toEqual(["฿", "0.00"]);
    expect([currencySymbol("USD"), amountExample("USD")]).toEqual(["$", "0.00"]);
  });
});

describe("practice country lookup", () => {
  const doctor = (result: unknown) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
    rpc: vi.fn(),
  });

  it("reads the doctor's own row", async () => {
    expect(await lookupPracticeCountry(doctor({ data: { country: "TH" }, error: null }) as never, "u1", "u1")).toEqual({ ok: true, country: "TH" });
  });

  it("is BR only when migration 110 isn't applied yet (42703 / no field)", async () => {
    expect(await lookupPracticeCountry(doctor({ data: null, error: { code: "42703" } }) as never, "u1", "u1")).toEqual({ ok: true, country: "BR" });
    expect(await lookupPracticeCountry(doctor({ data: {}, error: null }) as never, "u1", "u1")).toEqual({ ok: true, country: "BR" });
  });

  it("any other failure is unknown, not Brazil", async () => {
    expect(await lookupPracticeCountry(doctor({ data: null, error: { code: "PGRST301" } }) as never, "u1", "u1")).toEqual({ ok: false, code: "PGRST301" });
    expect(await lookupPracticeCountry(doctor({ data: null, error: null }) as never, "u1", "u1")).toEqual({ ok: false, code: "no_row" });
    const throws = { from: () => { throw new Error("network"); }, rpc: vi.fn() };
    expect(await lookupPracticeCountry(throws as never, "u1", "u1")).toEqual({ ok: false, code: "exception" });
  });

  it("uses get_my_clinic for a secretary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ country: "TH" }], error: null });
    expect(await lookupPracticeCountry({ from: vi.fn(), rpc } as never, "sec", "doc")).toEqual({ ok: true, country: "TH" });
    expect(rpc).toHaveBeenCalledWith("get_my_clinic");
    const old = vi.fn().mockResolvedValue({ data: [{ pix_key: "x" }], error: null });
    expect(await lookupPracticeCountry({ from: vi.fn(), rpc: old } as never, "sec", "doc")).toEqual({ ok: true, country: "BR" });
  });

  it("display falls back to BR on an unknown failure and reports it (code only)", async () => {
    expect(await getPracticeCountry(doctor({ data: null, error: { code: "PGRST301" } }) as never, "u1", "u1")).toBe("BR");
    expect(Sentry.captureMessage).toHaveBeenCalledWith("practice_country_lookup_failed", { level: "warning", tags: { code: "PGRST301" } });
  });
});

describe("phone examples by country (UX, app #206 shape)", () => {
  it("BR and TH have their own; Other has none (a neutral text instead)", () => {
    expect(countryProfile("BR").examples.mobile).toEqual({ local: "(11) 99999-9999", intl: "+55 (11) 99999-9999", national: "11 99999-9999" });
    expect(countryProfile("TH").examples.mobile).toEqual({ local: "081 234 5678", intl: "+66 81 234 5678", national: "81 234 5678" });
    expect(countryProfile("GB").examples.mobile).toBeNull();
  });

  it("by kind: OTHER is the explicit default, never read as a country code (which would be BR)", () => {
    expect(profileOfKind("OTHER").kind).toBe("OTHER");
    expect(profileOfKind("TH").kind).toBe("TH");
    expect(profileOfKind("BR").kind).toBe("BR");
  });

  it("by a dial code: +55 BR, +66 TH, anything else Other", () => {
    expect(profileOfPhonePrefix("+55").kind).toBe("BR");
    expect(profileOfPhonePrefix("+66").kind).toBe("TH");
    expect(profileOfPhonePrefix("+1").kind).toBe("OTHER");
  });
});

describe("push fallback language and receipts by country (#239)", () => {
  it("BR pt-BR + the web recibo; TH th + receipts in the app; Other en + the web recibo", () => {
    expect([countryProfile("BR").fallbackLocale, countryProfile("BR").receipts]).toEqual(["pt-BR", "web"]);
    expect([countryProfile("TH").fallbackLocale, countryProfile("TH").receipts]).toEqual(["th", "app"]);
    expect([countryProfile("US").fallbackLocale, countryProfile("US").receipts]).toEqual(["en", "web"]);
    // Unknown (no row yet) is Brazil, as before migration 110.
    expect(countryProfile(null).fallbackLocale).toBe("pt-BR");
  });
});

describe("the printed year by country (#239)", () => {
  it("Buddhist era for TH, Gregorian elsewhere, via the registry", async () => {
    const { docDate } = await import("@/lib/prescriptionDoc");
    expect(countryProfile("TH").calendar).toBe("buddhist");
    expect(docDate("TH", "2026-10-01")).toBe("01/10/2569");
    expect(docDate("BR", "2026-10-01")).toBe("01/10/2026");
    expect(docDate("ZZ", "2026-10-01")).toBe("01/10/2026");
  });
});

describe("patient identifier fields by country (#239)", () => {
  it("BR CPF; TH Thai ID (digits) + passport; Other passport/ID", () => {
    expect(profileOfKind("BR").idFields.map((f) => f.name)).toEqual(["cpf"]);
    expect(profileOfKind("TH").idFields.map((f) => [f.name, f.label, f.store])).toEqual([["th_national_id", "thaiId", "digits"], ["passport_number", "passport", "text"]]);
    expect(profileOfKind("OTHER").idFields.map((f) => [f.name, f.label])).toEqual([["passport_number", "passportOrId"]]);
  });
});

describe("how each ID field is searched and checked (#239)", () => {
  it("CPF and the Thai ID by digits, passports as text; only the Thai ID has a checksum", () => {
    const all = ["BR", "TH", "OTHER"].flatMap((k) => profileOfKind(k as "BR" | "TH" | "OTHER").idFields);
    expect(all.map((f) => [f.name, f.search, f.checksum ?? null])).toEqual([
      ["cpf", "digits", null],
      ["th_national_id", "digits", "thai"], ["passport_number", "text", null],
      ["passport_number", "text", null],
    ]);
  });
});

describe("health card and address order by country (#239)", () => {
  it("BR has the CNS and the Brazilian line; TH its own order; Other the international one", () => {
    expect([countryProfile("BR").healthCard, countryProfile("BR").addressFormat]).toEqual(["cns", "br"]);
    expect([countryProfile("TH").healthCard, countryProfile("TH").addressFormat]).toEqual([null, "th"]);
    expect([countryProfile("GB").healthCard, countryProfile("GB").addressFormat]).toEqual([null, "intl"]);
    // The address helpers take the kind: OTHER is the default, never Brazil.
    expect(profileOfKind("OTHER").healthCard).toBeNull();
  });
});
