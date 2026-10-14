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

type Glyphs = { glyphs: { id: number; codePoints?: number[] }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
type FontkitFont = { unitsPerEm: number; layout(text: string): Glyphs; glyphForCodePoint?(cp: number): { id: number } | null };

// The text layer (copy, search, screen readers): each glyph drawn maps to the
// characters it stands for, as the shaped run says. pdf-lib builds that map
// from the font's own cmap instead, which is wrong for the forms a layout
// substitutes: Thai's .narrow / .small tone marks and vowels are also mapped
// there from spacing modifier letters, so a whole-embedded font (Trirong,
// Prompt) read "ป่" as "ปˡ" (ca, 10-15). A glyph standing for no character
// (the tail of the น้ำ ligature) gets no entry, never a stray U+0003.
const drawnChars = new WeakMap<PDFFont, Map<number, number[]>>();

type Embedder = {
  glyphId(glyph: { id: number }): number;
  embedUnicodeCmap(context: { flateStream(s: string): unknown; register(o: unknown): unknown }): unknown;
};

const hex4 = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
function utf16Hex(cp: number): string {
  if (cp <= 0xffff) return hex4(cp);
  const v = cp - 0x10000;
  return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
}

// The ToUnicode CMap for the glyphs in `chars` (glyph id → characters).
export function toUnicodeCmap(entries: [cid: number, chars: number[]][]): string {
  const lines = entries.filter(([, cps]) => cps.length).map(([cid, cps]) => `<${hex4(cid)}> <${cps.map(utf16Hex).join("")}>`);
  // A bfchar block holds at most 100 entries.
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 100) {
    const part = lines.slice(i, i + 100);
    blocks.push(`${part.length} beginbfchar\n${part.join("\n")}\nendbfchar`);
  }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo <<\n  /Registry (Adobe)\n  /Ordering (UCS)\n  /Supplement 0\n>> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000><ffff>\nendcodespacerange\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
}

// Records the run's glyphs, and on the font's first use replaces pdf-lib's
// ToUnicode with one built from what was drawn (subset or whole: the
// embedder's glyphId gives the id the content stream uses).
function remember(font: PDFFont, f: FontkitFont, glyphs: Glyphs["glyphs"]) {
  const saraAa = f.glyphForCodePoint?.(0x0e32)?.id;
  let map = drawnChars.get(font);
  if (!map) {
    map = new Map();
    drawnChars.set(font, map);
    const embedder = (font as unknown as { embedder?: Embedder }).embedder;
    if (embedder) {
      const chars = map;
      embedder.embedUnicodeCmap = function (this: Embedder, context) {
        const entries = [...chars].map(([id, cps]) => [this.glyphId({ id }), cps] as [number, number[]]);
        return context.register(context.flateStream(toUnicodeCmap(entries)));
      };
    }
  }
  glyphs.forEach((g, i) => {
    let cps = g.codePoints ?? [];
    // Sara am (ำ = nikhahit + sara aa): fonts draw it as a ligature (nikhahit,
    // with any tone mark) plus the ordinary sara aa glyph, which the layout
    // leaves with no characters. One glyph id has one meaning in the text
    // layer, and that glyph is "า" in every other word, so the cluster is
    // written decomposed: the ligature as its tone + nikhahit, the tail as า
    // (น้ำ reads "น้ํา", the same text after NFKD; never "น้ำา").
    // (By glyph id: fontkit reuses one glyph object per id, so the tail can
    // arrive carrying "า" from an earlier word.)
    if (cps.at(-1) === 0x0e33 && glyphs[i + 1]?.id === saraAa) cps = [...cps.slice(0, -1), 0x0e4d];
    if (g.id === saraAa) cps = [0x0e32];
    if (!map.has(g.id)) map.set(g.id, cps);
  });
}

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
  const { glyphs, positions } = f.layout(text);
  remember(font, f, glyphs);
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
