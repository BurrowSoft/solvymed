import { describe, expect, it } from "vitest";
import {
  CURATED_FONTS, DEFAULT_DESIGN, DESIGN_MAX_BYTES, PALETTE_PRESETS, contactKindsFor, validateDesign, type Design,
} from "@/lib/studio/design";

// Document Studio PR1: the design JSON (the contract with the app, c5) and
// the checks the server repeats (_validate_design_v1).

const clone = (d: Design) => JSON.parse(JSON.stringify(d)) as Design;
const withPatch = (patch: (d: Record<string, unknown>) => void) => { const d = clone(DEFAULT_DESIGN) as unknown as Record<string, unknown>; patch(d); return d; };

describe("the design", () => {
  it("today's look is a valid design: Classic, the system font, today's colours, nothing else turned on", () => {
    expect(validateDesign(DEFAULT_DESIGN)).toEqual({ ok: true, design: DEFAULT_DESIGN });
    expect(DEFAULT_DESIGN.layout).toBe("classic");
    expect(DEFAULT_DESIGN.font).toBe("system");
    expect(DEFAULT_DESIGN.palette.primary).toBe("#208AEF");
    expect(DEFAULT_DESIGN.watermark.on).toBe(false);
    expect(DEFAULT_DESIGN.signature).toEqual({ stamp: true, image: false, imagePath: null });
  });

  it("a full design with every slot used is valid", () => {
    const d = clone(DEFAULT_DESIGN);
    Object.assign(d, {
      layout: "elegant", font: "trirong",
      palette: { ...PALETTE_PRESETS.sageSand, preset: "sageSand" },
      nameBlock: { style: "spaced" }, logoUse: { header: "reversed" },
      watermark: { on: true, logo: "square", size: "l", opacity: 0.08 },
      sectionBar: { fill: "primary", text: "white", upper: true, spaced: true },
      field: { style: "underline", line: "accent" },
      footer: { columns: 3, locations: true, contacts: [{ kind: "whatsapp", value: "+55 85 99999-0000" }, { kind: "instagram", value: "@dravivian" }] },
      band: { style: "twoTone", colors: ["primary", "accent"] },
      signature: { stamp: true, image: true, imagePath: "doc-1/sig.png" },
      texts: { prescription: { header: "Clínica Vivian", footer: null }, letterhead: { header: null, footer: "Seg–Sex 8h–18h" } },
    });
    expect(validateDesign(d).ok).toBe(true);
    for (const f of CURATED_FONTS) expect(validateDesign({ ...d, font: f }).ok).toBe(true);
  });

  it.each([
    ["an unknown top-level key", (d: Record<string, unknown>) => { d.freeCanvas = true; }],
    ["a missing slot", (d: Record<string, unknown>) => { delete d.band; }],
    ["another version", (d: Record<string, unknown>) => { d.v = 2; }],
    ["a layout outside the presets", (d: Record<string, unknown>) => { d.layout = "fancy"; }],
    ["an uploaded font", (d: Record<string, unknown>) => { d.font = "comic-sans"; }],
    ["a non-hex colour", (d: Record<string, unknown>) => { (d.palette as Record<string, unknown>).primary = "red"; }],
    ["an unknown palette preset", (d: Record<string, unknown>) => { (d.palette as Record<string, unknown>).preset = "neon"; }],
    ["a raw hex where a palette reference goes", (d: Record<string, unknown>) => { (d.sectionBar as Record<string, unknown>).fill = "#FF0000"; }],
    ["a watermark too strong", (d: Record<string, unknown>) => { (d.watermark as Record<string, unknown>).opacity = 0.5; }],
    ["4 footer columns", (d: Record<string, unknown>) => { (d.footer as Record<string, unknown>).columns = 4; }],
    ["7 contacts", (d: Record<string, unknown>) => { (d.footer as Record<string, unknown>).contacts = Array.from({ length: 7 }, () => ({ kind: "phone", value: "1" })); }],
    ["a contact kind not offered", (d: Record<string, unknown>) => { (d.footer as Record<string, unknown>).contacts = [{ kind: "fax", value: "1" }]; }],
    ["an empty contact", (d: Record<string, unknown>) => { (d.footer as Record<string, unknown>).contacts = [{ kind: "phone", value: " " }]; }],
    ["three band colours", (d: Record<string, unknown>) => { (d.band as Record<string, unknown>).colors = ["primary", "accent", "light"]; }],
    ["no typed stamp (legal details always printed)", (d: Record<string, unknown>) => { (d.signature as Record<string, unknown>).stamp = false; }],
    ["a signature image without its file", (d: Record<string, unknown>) => { (d.signature as Record<string, unknown>).image = true; }],
    ["texts for a legal layout", (d: Record<string, unknown>) => { d.texts = { controlled_prescription: { header: "x", footer: null } }; }],
    ["a text over 300 characters", (d: Record<string, unknown>) => { d.texts = { receipt: { header: "x".repeat(301), footer: null } }; }],
  ])("refuses %s", (_, patch) => {
    expect(validateDesign(withPatch(patch)).ok).toBe(false);
  });

  it("refuses a design over 32 KB", () => {
    const d = withPatch((x) => { x.texts = Object.fromEntries(["prescription", "certificate", "declaration", "exam_request", "th_certificate", "receipt", "history", "letterhead"].map((k) => [k, { header: "é".repeat(300), footer: "é".repeat(300) }])); });
    expect(validateDesign(d).ok).toBe(true);
    const big = { ...d, texts: { ...(d.texts as object), padding: "x".repeat(DESIGN_MAX_BYTES) } };
    expect(validateDesign(big).ok).toBe(false);
  });

  it("the contacts offered follow the practice country (config, not if-BR)", () => {
    expect(contactKindsFor("BR")).toContain("whatsapp");
    expect(contactKindsFor("BR")).not.toContain("line");
    expect(contactKindsFor("TH")).toContain("line");
    expect(contactKindsFor("TH")).not.toContain("whatsapp");
    expect(contactKindsFor("US")).toEqual(["phone", "instagram", "site", "email"]);
  });
});
