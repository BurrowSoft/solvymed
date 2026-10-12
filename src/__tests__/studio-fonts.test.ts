// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawShaped } from "@/lib/pdf/text";
import { CURATED_FONTS } from "@/lib/studio/design";
import { embedDesignFonts, FONT_FILES, fontFilesFor, loadDesignFontBytes } from "@/lib/pdf/fonts";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR1: the curated fonts (Sarabun, Trirong, Prompt) each
// cover Latin AND Thai, and draw through our shaped drawer (pdf-lib alone
// misplaces Thai marks). A golden per font guards the Thai shaping; a font
// that fails is dropped from the set (02), never shipped half-working.

const read = (p: string) => readFile(join(process.cwd(), "public", p)).then((b) => new Uint8Array(b));
// Stacked marks over tall consonants, tone marks, sara am, Latin and digits.
const SAMPLE_TH = ["ปิ่น ป้า ฟ้า ฝั่ง ผู้ป่วย นัดหมาย", "ใบรับรองแพทย์ ใบสั่งยา หัตถการ ๑๒๓", "น้ำ ช้ำ ปั้น ฝั้น กรุงเทพฯ"];
const SAMPLE_LATIN = "Dra. Ana Souza · CRM 12345/SP · 12/10/2026 · R$ 150,00";

type FK = { layout(t: string): { glyphs: { id: number; name?: string }[] } };

describe("the curated fonts", () => {
  it("each family has regular + bold files, and 'system' renders in Sarabun", async () => {
    for (const id of CURATED_FONTS) {
      const b = await loadDesignFontBytes(id, read);
      expect(b.regular.byteLength, id).toBeGreaterThan(50_000);
      expect(b.bold.byteLength, id).toBeGreaterThan(50_000);
    }
    expect(fontFilesFor("system")).toBe(FONT_FILES.sarabun);
  });

  it("every Thai and Latin character of the samples has a glyph (no .notdef) in every font", async () => {
    for (const id of CURATED_FONTS) {
      const { regular, bold } = await loadDesignFontBytes(id, read);
      for (const bytes of [regular, bold]) {
        const f = (fontkit as unknown as { create(b: Uint8Array): FK }).create(bytes);
        for (const text of [...SAMPLE_TH, SAMPLE_LATIN]) {
          const missing = f.layout(text).glyphs.filter((g) => g.id === 0);
          expect(missing.length, `${id}: ${text}`).toBe(0);
        }
      }
    }
  });

  it.each(CURATED_FONTS.map((id) => [id]))("%s: the Thai and Latin sample matches its golden", async (id) => {
    // Each font as the renderers embed it (subset only where it is safe).
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const { regular: r, bold: b } = await embedDesignFonts(pdf, id, await loadDesignFontBytes(id, read));
    const page = pdf.addPage([420, 200]);
    let y = 170;
    for (const text of SAMPLE_TH) { drawShaped(page, text, { x: 16, y, font: r, size: 18, color: rgb(0.1, 0.13, 0.22) }); y -= 30; }
    drawShaped(page, SAMPLE_TH[0], { x: 16, y, font: b, size: 18, color: rgb(0.13, 0.54, 0.94) }); y -= 30;
    drawShaped(page, SAMPLE_LATIN, { x: 16, y, font: r, size: 12, color: rgb(0.1, 0.13, 0.22) });
    const png = await renderPdfPage(await pdf.save());
    const { written, diffRatio } = compareGolden(`font-${id}`, png);
    if (!written) expect(diffRatio, `font-${id}`).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);
});
