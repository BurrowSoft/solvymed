import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { countryProfile, normalizeCountry } from "@/lib/country";
import { formatMoney } from "@/lib/money";
import { getPracticeCountry, lookupPracticeCountry } from "@/lib/practiceCountry";

describe("countryProfile", () => {
  it("maps BR, TH and everything else", () => {
    expect(countryProfile("BR")).toMatchObject({ currency: "BRL", patientId: "cpf", paymentQr: "pix", defaultTimeZone: "America/Sao_Paulo" });
    expect(countryProfile("th")).toMatchObject({ currency: "THB", patientId: "thai_id", paymentQr: "promptpay", defaultTimeZone: "Asia/Bangkok" });
    for (const c of ["PT", "US", "ZZ"]) expect(countryProfile(c)).toMatchObject({ kind: "OTHER", currency: "USD", paymentQr: null });
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
