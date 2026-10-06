// Text for the website's PDFs (1.8.0: documents shared with the patient, and
// B's documents). pdf-lib draws a run with the glyphs a font's layout picks
// (its substitutions: Thai's .small / .narrow forms) but ignores their
// positioning offsets, so Thai marks stacked over a tall consonant land in
// the wrong place ("ปิ่น"). drawShaped places each glyph itself, with the
// offsets fontkit's layout gives. Lines break at Intl.Segmenter's word
// boundaries: Thai has no spaces between words.
import {
  PDFHexString, beginText, endText, popGraphicsState, pushGraphicsState, setFillingColor, setFontAndSize,
  setTextMatrix, showText, type Color, type PDFFont, type PDFPage,
} from "pdf-lib";

type Glyphs = { glyphs: { id: number }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
type FontkitFont = { unitsPerEm: number; layout(text: string): Glyphs };

// The fontkit font behind an embedded custom font (pdf-lib keeps it on its embedder).
function fontkitOf(font: PDFFont): FontkitFont {
  const f = (font as unknown as { embedder?: { font?: FontkitFont } }).embedder?.font;
  if (!f || typeof f.layout !== "function") throw new Error("pdf: a custom (fontkit) font is required");
  return f;
}

// The run's width in points, from the shaped advances.
export function textWidth(font: PDFFont, text: string, size: number): number {
  if (!text) return 0;
  const f = fontkitOf(font);
  const { positions } = f.layout(text);
  return (positions.reduce((w, p) => w + p.xAdvance, 0) * size) / f.unitsPerEm;
}

// Draws one line (no wrapping) at x, y (the baseline), each glyph at its
// shaped position. The glyphs are registered with the subset through
// font.encodeText, whose hex is one 4-digit glyph id per laid-out glyph.
export function drawShaped(page: PDFPage, text: string, opts: { x: number; y: number; font: PDFFont; size: number; color: Color }): number {
  if (!text) return 0;
  const { x, y, font, size, color } = opts;
  const f = fontkitOf(font);
  const { positions } = f.layout(text);
  const hex = font.encodeText(text).asString().replace(/[<>]/g, "");
  if (hex.length !== positions.length * 4) throw new Error("pdf: glyph count mismatch");
  const scale = size / f.unitsPerEm;
  const key = page.node.newFontDictionary(font.name, font.ref);
  const ops = [pushGraphicsState(), setFillingColor(color), beginText(), setFontAndSize(key, size)];
  let pen = 0;
  positions.forEach((p, i) => {
    ops.push(setTextMatrix(1, 0, 0, 1, x + (pen + p.xOffset) * scale, y + p.yOffset * scale));
    ops.push(showText(PDFHexString.of(hex.slice(i * 4, i * 4 + 4))));
    pen += p.xAdvance;
  });
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
  return pen * scale;
}

// Break opportunities: words (Thai included) and the spaces between them.
function segments(text: string, locale: string): string[] {
  try {
    const seg = new Intl.Segmenter(locale, { granularity: "word" });
    return Array.from(seg.segment(text), (s) => s.segment);
  } catch {
    return text.split(/(\s+)/).filter(Boolean);
  }
}

// The text as lines of at most maxWidth points. Explicit line breaks are
// kept; a single word wider than the line is cut by characters.
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, locale = "en"): string[] {
  const out: string[] = [];
  for (const para of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const seg of segments(para, locale)) {
      const next = line + seg;
      if (textWidth(font, next.trimEnd(), size) <= maxWidth) { line = next; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = /^\s+$/.test(seg) ? "" : seg;
      // One word longer than the line: cut it.
      while (textWidth(font, line, size) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(font, line.slice(0, cut), size) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
