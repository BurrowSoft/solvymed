// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawShaped, toUnicodeCmap } from "@/lib/pdf/text";
import { embedDesignFonts, fontFilesFor } from "@/lib/pdf/fonts";

// The PDFs' text layer (copy, search, screen readers) says what the page
// shows (ca, 10-15): in a whole-embedded font (Trirong, Prompt) Thai's tone
// marks and upper vowels read as spacing modifier letters ("ป่" → "ปˡ"), and
// every font added a stray U+0003 after "น้ำ". Every mark, on a short and on
// tall consonants (where fonts swap in .narrow / .small forms), and real
// words, in each typeface exactly as the documents embed it.

const MARKS = ["่", "้", "๊", "๋", "์", "ิ", "ี", "ึ", "ื", "ั", "็", "ํ"];
const CASES = [
  ...MARKS.flatMap((m) => ["ก", "ป", "ฝ", "ฟ"].map((c) => c + m)),
  "ปิ่น", "ป่า", "ฝ้าย", "ป๋า", "ที่", "ไม่", "สิ้น", "น้ำ", "กี่", "ผู้ป่วย", "ใบรับรองแพทย์", "Dr. Ana 12/10/2026",
];

const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", "fonts", p)));

async function roundTrip(fontId: "sarabun" | "trirong" | "prompt", lines: string[]): Promise<string[]> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const files = fontFilesFor(fontId);
  const { regular, bold } = await embedDesignFonts(pdf, fontId, {
    regular: read(`${files.dir}/${files.regular}`), bold: read(`${files.dir}/${files.bold}`),
  });
  // One line per page, so each reads back alone.
  for (const [i, s] of lines.entries()) {
    const page = pdf.addPage([400, 100]);
    drawShaped(page, s, { x: 20, y: 50, font: i % 2 ? bold : regular, size: 14, color: rgb(0, 0, 0) });
  }
  const bytes = await pdf.save();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: bytes, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    out.push(tc.items.map((i) => ("str" in i ? i.str : "")).join(""));
  }
  return out;
}

describe("the PDFs' text layer matches the text, in every typeface", () => {
  for (const id of ["sarabun", "trirong", "prompt"] as const) {
    it(`${id}: every Thai mark and vowel, short and tall consonants, words`, async () => {
      const got = await roundTrip(id, CASES);
      // NFKC: sara am is written decomposed (ำ = ํ + า), the same text after
      // normalisation (d6, 10-15: accepted; don't "fix" it back).
      const wrong = CASES.map((s, i) => [s, got[i]] as const).filter(([s, g]) => g.normalize("NFKC") !== s.normalize("NFKC"));
      expect(wrong, `${id}: ${wrong.map(([s, g]) => `${s} → ${g}`).join(", ")}`).toEqual([]);
      // No control characters (the old stray U+0003 after น้ำ), and sara aa
      // still reads as itself in the same document after a sara am.
      expect(got.join("")).not.toMatch(/[\u0000-\u001f]/);
      expect(got[CASES.indexOf("ป่า")]).toBe("ป่า");
      // Sara am, on purpose: the decomposed form, one glyph per meaning. One
      // glyph id has one meaning in the text layer, and the tail glyph is "า"
      // in every other word: the composed ำ would need it to mean nothing here.
      expect(got[CASES.indexOf("น้ำ")]).toBe("น้ํา");
    }, 60_000);
  }
});

describe("toUnicodeCmap", () => {
  it("skips glyphs that stand for no character, and writes UTF-16 (BMP and beyond)", () => {
    const cmap = toUnicodeCmap([[5, [0x0e48]], [6, []], [7, [0x0e49, 0x0e33]], [8, [0x1f600]]]);
    expect(cmap).toContain("<0005> <0E48>");
    expect(cmap).not.toContain("<0006>");
    expect(cmap).toContain("<0007> <0E490E33>");
    expect(cmap).toContain("<0008> <D83DDE00>");
    expect(cmap).toContain("3 beginbfchar");
  });

  it("splits into blocks of at most 100 entries", () => {
    const cmap = toUnicodeCmap(Array.from({ length: 250 }, (_, i) => [i, [0x41]] as [number, number[]]));
    expect(cmap.match(/beginbfchar/g)).toHaveLength(3);
    expect(cmap).toContain("50 beginbfchar");
  });
});
