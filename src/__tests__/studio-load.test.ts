import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESIGN, type Design } from "@/lib/studio/design";
import type { LegacyStyle } from "@/lib/studio/resolve";

// Document Studio PR2 (plumbing): the PDFs read the practice's design
// through c5's get_practice_design(); until Studio is live, or without a
// saved, valid design, every document is drawn exactly as today.

const cond = vi.hoisted(() => ({ live: false }));
vi.mock("@/lib/conditions", () => ({ conditionMet: (id: string) => id === "document-studio-live" && cond.live }));

import { designDocType, documentStyle, loadPracticeDesign } from "@/lib/studio/load";

const LEGACY: LegacyStyle = { primaryColor: "#208AEF", accentColor: "#E8F4FE", headerText: "Cabeçalho antigo", footerText: "Rodapé antigo", brandColor: "#116E99" };
const design = (): Design => {
  const d = structuredClone(DEFAULT_DESIGN);
  d.font = "trirong";
  d.palette = { ...d.palette, primary: "#1F3A5F", light: "#F4EFE6" };
  d.texts = { ...d.texts, certificate: { header: "Atestados", footer: "Rodapé do atestado" } };
  return d;
};
const db = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) });

beforeEach(() => { cond.live = false; });

describe("loadPracticeDesign", () => {
  it("a saved, valid design (row or one-row list)", async () => {
    expect(await loadPracticeDesign(db({ design: design(), saved: true, version: 3 }))).toMatchObject({ saved: true, version: 3 });
    expect(await loadPracticeDesign(db([{ design: design(), saved: false, version: 1 }]))).toMatchObject({ saved: false });
  });
  it("no function yet (before c5's migration), an error, nothing, an invalid design or a throw: none", async () => {
    expect(await loadPracticeDesign(db(null, { code: "PGRST202", message: "Could not find the function" }))).toBeNull();
    expect(await loadPracticeDesign(db(null))).toBeNull();
    expect(await loadPracticeDesign(db({ design: { v: 9 }, saved: true }))).toBeNull();
    expect(await loadPracticeDesign({ rpc: () => { throw new TypeError("Failed to fetch"); } })).toBeNull();
  });
});

describe("documentStyle", () => {
  it("Studio not live: today's style, with no read at all", async () => {
    const s = db({ design: design(), saved: true, version: 1 });
    const type = vi.fn(() => "certificate" as const);
    expect(await documentStyle(s, LEGACY, type)).toEqual({ ...LEGACY, fontId: "sarabun" });
    expect(s.rpc).not.toHaveBeenCalled();
    expect(type).not.toHaveBeenCalled();
  });

  it("live + a saved design: its font, palette and the type's texts", async () => {
    cond.live = true;
    expect(await documentStyle(db({ design: design(), saved: true, version: 1 }), LEGACY, async () => "certificate" as const)).toEqual({
      fontId: "trirong", primaryColor: "#1F3A5F", accentColor: "#F4EFE6", headerText: "Atestados", footerText: "Rodapé do atestado", brandColor: "#1F3A5F",
    });
  });

  it("live, but not saved, not readable, or a legal layout: today's style (the type isn't even looked up unless saved)", async () => {
    cond.live = true;
    const type = vi.fn(async () => "certificate" as const);
    expect(await documentStyle(db({ design: design(), saved: false, version: 1 }), LEGACY, type)).toEqual({ ...LEGACY, fontId: "sarabun" });
    expect(await documentStyle(db(null, { code: "PGRST202" }), LEGACY, type)).toEqual({ ...LEGACY, fontId: "sarabun" });
    expect(type).not.toHaveBeenCalled();
    expect(await documentStyle(db({ design: design(), saved: true, version: 1 }), LEGACY, () => designDocType("controlled_prescription"))).toEqual({ ...LEGACY, fontId: "sarabun" });
  });

  it("designDocType: the designable types only", () => {
    expect(designDocType("certificate")).toBe("certificate");
    expect(designDocType("th_certificate")).toBe("th_certificate");
    expect(designDocType("controlled_prescription")).toBeNull();
    expect(designDocType(undefined)).toBeNull();
  });
});
