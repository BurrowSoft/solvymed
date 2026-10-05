import { describe, expect, it } from "vitest";
import { zoneCity, zonedInstant } from "@/lib/clinicTime";

// "Todos" across time zones (cf, from 76's #369 row; the app's twin): the
// list follows the real order, each time stays in its doctor's clock, and
// the city follows every time when the shown zones differ.

describe("zonedInstant", () => {
  it("17:30 in Manaus comes after 18:00 in São Paulo (cf's example)", () => {
    const manaus = zonedInstant("2026-10-06", "17:30:00", "America/Manaus");
    const saoPaulo = zonedInstant("2026-10-06", "18:00:00", "America/Sao_Paulo");
    expect(new Date(manaus).toISOString()).toBe("2026-10-06T21:30:00.000Z");
    expect(new Date(saoPaulo).toISOString()).toBe("2026-10-06T21:00:00.000Z");
    expect(saoPaulo).toBeLessThan(manaus);
  });

  it("Bangkok and a zone with daylight saving", () => {
    expect(new Date(zonedInstant("2026-10-06", "09:00", "Asia/Bangkok")).toISOString()).toBe("2026-10-06T02:00:00.000Z");
    expect(new Date(zonedInstant("2026-07-01", "09:00", "Europe/Lisbon")).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(new Date(zonedInstant("2026-01-15", "09:00", "Europe/Lisbon")).toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("sorting a mixed list by it", () => {
    const rows = [
      { id: "C", date: "2026-10-06", t: "17:30", z: "America/Manaus" },
      { id: "B", date: "2026-10-06", t: "18:00", z: "America/Sao_Paulo" },
      { id: "A", date: "2026-10-06", t: "16:00", z: "America/Manaus" },
    ];
    expect(rows.sort((x, y) => zonedInstant(x.date, x.t, x.z) - zonedInstant(y.date, y.t, y.z)).map((r) => r.id)).toEqual(["A", "B", "C"]);
  });
});

describe("zoneCity", () => {
  it("the registry's accented spellings (the app's #379 list), else the IANA last segment", () => {
    expect(Object.fromEntries(["America/Sao_Paulo", "America/Belem", "America/Araguaina", "America/Maceio", "America/Cuiaba", "America/Santarem", "America/Eirunepe"].map((z) => [z, zoneCity(z)]))).toEqual({
      "America/Sao_Paulo": "São Paulo", "America/Belem": "Belém", "America/Araguaina": "Araguaína", "America/Maceio": "Maceió",
      "America/Cuiaba": "Cuiabá", "America/Santarem": "Santarém", "America/Eirunepe": "Eirunepé",
    });
    expect(["America/Manaus", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "Asia/Bangkok", "America/Argentina/Buenos_Aires", "UTC"].map(zoneCity))
      .toEqual(["Manaus", "Porto Velho", "Rio Branco", "Noronha", "Bangkok", "Buenos Aires", "UTC"]);
  });

  it("TH and the default have no spellings of their own", async () => {
    const { countryProfile } = await import("@/lib/country");
    expect([countryProfile("TH").zoneCities, countryProfile("ZZ").zoneCities]).toEqual([{}, {}]);
  });
});
