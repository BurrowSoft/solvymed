// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { DEFAULT_DESIGN, LAYOUTS, validateDesign, type Design, type KnownLayout } from "@/lib/studio/design";
import { cleanDesign, forEditing, LAYOUT_STARTERS, withBand, withLayout, withSectionFill } from "@/lib/studio/starters";
import { prescriptionContent } from "@/lib/studio/content";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR3, the editor's rules: every edit keeps the design valid
// (the server refuses anything else), a layout pick keeps the doctor's own
// choices, and the per-type texts (carried over from Document Templates)
// are drawn in a saved design.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const sample = JSON.parse(readFileSync(join(FIX, "sample.json"), "utf8"));
const design = (name: string): Design => JSON.parse(readFileSync(join(FIX, "designs", `${name}.json`), "utf8"));

describe("Studio editor rules", () => {
  it("a layout pick applies its starting look and keeps the doctor's palette, logo, footer and texts", () => {
    const mine: Design = {
      ...forEditing(structuredClone(DEFAULT_DESIGN)),
      palette: { primary: "#112233", accent: "#445566", light: "#F0F0F0", preset: null },
      logoUse: { header: "square" },
      footer: { columns: 2, locations: false, contacts: [{ kind: "phone", value: "+55 11 5555-0000" }] },
      texts: { prescription: { header: "Uso oral", footer: null } },
    };
    for (const l of LAYOUTS) {
      const d = withLayout(mine, l as KnownLayout);
      expect(validateDesign(d).ok).toBe(true);
      expect(d.layout).toBe(l);
      expect(d.font).toBe(LAYOUT_STARTERS[l as KnownLayout].font);
      expect(d.palette).toEqual(mine.palette);
      expect(d.logoUse).toEqual(mine.logoUse);
      expect(d.footer).toEqual(mine.footer);
      expect(d.texts).toEqual(mine.texts);
    }
  });

  it("every band style and section fill stays valid; two-tone takes two different colours", () => {
    const base = withLayout(forEditing(structuredClone(DEFAULT_DESIGN)), "elegant");
    for (const s of ["none", "flat", "twoTone", "rounded", "angled"] as const) {
      const d = withBand(base, s);
      expect(validateDesign(d).ok).toBe(true);
      expect(d.band.colors.length).toBe(s === "none" ? 0 : s === "twoTone" ? 2 : 1);
      if (s === "twoTone") expect(d.band.colors[0]).not.toBe(d.band.colors[1]);
    }
    for (const f of ["none", "primary", "accent"] as const) {
      const d = withSectionFill(base, f);
      expect(validateDesign(d).ok).toBe(true);
      expect(d.sectionBar.text).toBe(f === "none" ? "ink" : "white");
    }
  });

  it("an unsaved design ('system') is edited as Sarabun; the saved one never says system", () => {
    expect(forEditing(structuredClone(DEFAULT_DESIGN)).font).toBe("sarabun");
    expect(forEditing({ ...structuredClone(DEFAULT_DESIGN), font: "prompt" }).font).toBe("prompt");
  });

  it("an unknown (newer) layout id is kept through edits other than a layout pick", () => {
    const d = withBand({ ...forEditing(structuredClone(DEFAULT_DESIGN)), layout: "watercolor" }, "flat");
    expect(d.layout).toBe("watercolor");
    expect(validateDesign(cleanDesign(d)).ok).toBe(true);
  });

  it("what is saved: empty contacts dropped, values trimmed, empty texts left out; it validates", () => {
    const d = cleanDesign({
      ...forEditing(structuredClone(DEFAULT_DESIGN)),
      footer: { columns: 1, locations: true, contacts: [{ kind: "whatsapp", value: "  +55 11 9999-0000 " }, { kind: "phone", value: "   " }] },
      texts: { prescription: { header: "  ", footer: "Rua A, 1" }, certificate: { header: "", footer: null } },
    });
    expect(d.footer.contacts).toEqual([{ kind: "whatsapp", value: "+55 11 9999-0000" }]);
    expect(d.texts).toEqual({ prescription: { header: null, footer: "Rua A, 1" } });
    expect(validateDesign(d).ok).toBe(true);
  });
});

// The texts in a saved design: a muted line under the title, a small line
// above the footer (and its rule), the signature moved up; above the band.
describe("Studio header and footer texts", () => {
  for (const name of ["classic", "band-twoTone-3col"]) {
    it(`${name}: drawn with the type's texts`, async () => {
      const d = design(name);
      const pr = sample.practice, doc = sample.document;
      const bytes = await renderDesignedDocument({
        design: d, locale: "pt-BR",
        practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
        logos: { square: null, wide: null, reversed: null },
        doc: {
          ...prescriptionContent({ title: doc.title, patientLabel: "Paciente", patientName: doc.patientName, dateLabel: "Data", date: "12/10/2026", items: doc.items, notesLabel: "Orientações", notes: doc.notes }),
          headerText: "Uso oral · tomar conforme orientação médica",
          footerText: "Atendimento com hora marcada. Em caso de reação alérgica, suspenda o uso e procure atendimento imediatamente.",
        },
      }, await loadDesignFontBytes(d.font, async (p) => read(p)));
      const png = await renderPdfPage(bytes, 0, 1);
      expect(compareGolden(`studio-texts-${name}`, png).diffRatio).toBeLessThanOrEqual(GOLDEN_TOLERANCE);
    }, 60_000);
  }
});
