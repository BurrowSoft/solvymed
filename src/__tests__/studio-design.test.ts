import { describe, expect, it } from "vitest";
import {
  CURATED_FONTS, DEFAULT_DESIGN, DESIGN_MAX_BYTES, PALETTE_PRESETS, defaultContactKind, layoutFor, studioCountry, validateDesign, type Design,
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
    ["a malformed layout id", (d: Record<string, unknown>) => { d.layout = "Fancy Layout!"; }],
    ["a layout id that isn't text", (d: Record<string, unknown>) => { d.layout = 3; }],
    ["a layout id over 32 characters", (d: Record<string, unknown>) => { d.layout = "a" + "b".repeat(32); }],
    ["an uploaded font", (d: Record<string, unknown>) => { d.font = "comic-sans"; }],
    ["a non-hex colour", (d: Record<string, unknown>) => { (d.palette as Record<string, unknown>).primary = "red"; }],
    ["a prototype key as the preset", (d: Record<string, unknown>) => { (d.palette as Record<string, unknown>).preset = "constructor"; }],
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

  it("a design full of Thai text is still valid; its size is counted in UTF-8 bytes, as the server does", () => {
    const thai = "ก".repeat(299);
    const d = withPatch((x) => { x.texts = Object.fromEntries(["prescription", "certificate", "declaration", "exam_request", "th_certificate", "receipt", "history", "letterhead"].map((k) => [k, { header: thai, footer: thai }])); });
    expect(JSON.stringify(d).length).toBeLessThan(DESIGN_MAX_BYTES);
    expect(validateDesign(d).ok).toBe(true);
    const s = JSON.stringify(d);
    expect(new TextEncoder().encode(s).length).toBeGreaterThan(s.length);
  });

  it("a new contact's kind and the legal note follow the practice country (config + explicit default)", () => {
    expect(defaultContactKind("BR")).toBe("whatsapp");
    expect(defaultContactKind("TH")).toBe("line");
    expect(defaultContactKind("th")).toBe("line");
    expect(defaultContactKind("US")).toBe("phone");
    expect(defaultContactKind(null)).toBe("phone");
    expect(studioCountry("BR").legalNote).toBe("BR");
    expect(studioCountry("TH").legalNote).toBe("TH");
    expect(studioCountry("ZZ").legalNote).toBeNull();
  });
});

// Layouts are data (Vitor 10-14): a design saved with a layout a newer
// client added stays valid everywhere; this client draws it as Classic.
describe("layout ids", () => {
  it("any well-formed id is valid (a newer layout), the known ones too", () => {
    for (const id of ["classic", "elegant", "watercolor", "clinic-2027", "aa"]) {
      expect(validateDesign(withPatch((d) => { d.layout = id; })).ok).toBe(true);
    }
  });
  it("layoutFor: a known id as is; an unknown one draws Classic", () => {
    expect(layoutFor("modern")).toBe("modern");
    expect(layoutFor("watercolor")).toBe("classic");
  });
});
