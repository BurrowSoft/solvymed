import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESIGN } from "@/lib/studio/design";
import type { Brand } from "@/lib/brand";

// Document Studio PR2, the wiring: a document is drawn in the practice's
// design only with Studio live, a SAVED valid design and a type a design
// styles; anything else draws today's PDF (studio = null), without even
// reading the design while Studio is off.

const cond = vi.hoisted(() => ({ live: false }));
vi.mock("@/lib/conditions", () => ({ conditionMet: (id: string) => id === "document-studio-live" && cond.live }));

import { loadStudioForDocument } from "@/lib/studio/forDocument";

const design = () => ({ ...structuredClone(DEFAULT_DESIGN), layout: "elegant", font: "trirong" });
const db = (row: unknown) => ({
  rpc: vi.fn(async () => ({ data: row, error: null })),
  from: () => {
    const q = { select: () => q, eq: async () => ({ data: [{ id: "c1", name: "Unidade Jardins", address: "Rua das Acácias, 120", city: "São Paulo", state: "SP", is_primary: true }], error: null }) };
    return q;
  },
  storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }) },
});
const brand = { displayName: "Helena Duarte", title: "Dra.", specialty: "Clínica Geral", registrationLine: "CRM-SP 000000", accentColor: null, logoSquareUrl: "https://cdn/own-square.png", logoWideUrl: null, photoUrl: null, own: { logo_square: true, logo_wide: false, photo: false }, saved: true } as Brand;
const profile = { fullName: "Helena Duarte", registration: "CRM 000000/SP", clinicName: "Clínica Vida Plena" };

beforeEach(() => { cond.live = false; });

describe("loadStudioForDocument", () => {
  it("Studio not live: today's PDF, the design isn't read", async () => {
    const s = db({ design: design(), saved: true, assets: {} });
    expect(await loadStudioForDocument(s as never, "doc-1", () => "certificate", brand, profile)).toBeNull();
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("live + a saved design: the design, the practice block (brand first) and the logos", async () => {
    cond.live = true;
    const r = await loadStudioForDocument(db({ design: design(), saved: true, assets: { logoSquare: null, logoWide: "doc-1/wide.png", logoReversed: "doc-1/rev.png" } }) as never, "doc-1", () => "certificate", brand, profile);
    expect(r?.design.layout).toBe("elegant");
    expect(r?.practice).toEqual({ displayName: "Dra. Helena Duarte", specialty: "Clínica Geral", registrationLine: "CRM-SP 000000", clinicName: "Clínica Vida Plena", locations: [{ name: "Unidade Jardins", lines: ["Rua das Acácias, 120", "São Paulo · SP"] }] });
    expect(r?.logos).toEqual({ square: "https://cdn/own-square.png", wide: "https://cdn/doc-1/wide.png", reversed: "https://cdn/doc-1/rev.png" });
  });

  it("live, but not saved, invalid, or a legal layout / undesigned type: today's PDF", async () => {
    cond.live = true;
    expect(await loadStudioForDocument(db({ design: design(), saved: false }) as never, "doc-1", () => "certificate", brand, profile)).toBeNull();
    expect(await loadStudioForDocument(db({ design: { v: 9 }, saved: true }) as never, "doc-1", () => "certificate", brand, profile)).toBeNull();
    expect(await loadStudioForDocument(db({ design: design(), saved: true }) as never, "doc-1", () => null, brand, profile)).toBeNull();
  });
});
