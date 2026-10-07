// The website's document PDFs (1.8.0): the same frame as the app's
// (lib/pdf-utils buildDocumentHtml) and the website's print views. A4, the
// doctor's brand block (or the template's logo), the title in the
// document's colour over a 3-pt rule, the body, the signature area and the
// footer; long bodies continue on new pages. Every text goes through the
// shaped drawer (Thai), in Sarabun (Latin + Thai).
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawShaped, textWidth, wrapText } from "./text";

export const A4: [number, number] = [595.28, 841.89];
export const MARGIN = 48;
// One footer location line (8 pt).
const LOC_LH = 11;
export const INK = rgb(0x1a / 255, 0x21 / 255, 0x38 / 255); // #1A2138
export const MUTED = rgb(0x6b / 255, 0x7a / 255, 0x99 / 255); // #6B7A99
export const FAINT = rgb(0xa0 / 255, 0xab / 255, 0xbe / 255); // #A0ABBE
export const LINE = rgb(0xe5 / 255, 0xe9 / 255, 0xf0 / 255); // #E5E9F0

export type Fonts = { regular: PDFFont; bold: PDFFont };
export type FontBytes = { regular: Uint8Array; bold: Uint8Array };

// "#208AEF" → rgb; anything else → the fallback (only #hex, like the app).
export function hexColor(v: string | null | undefined, fallback = "#208AEF"): RGB {
  const s = typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback;
  const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1);
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

// The light tint of the accent the print views use (18% over white).
export function tint(c: RGB, amount = 0.18): RGB {
  return rgb(1 - (1 - c.red) * amount, 1 - (1 - c.green) * amount, 1 - (1 - c.blue) * amount);
}

// The fonts, from /fonts/sarabun in the browser (tests pass the bytes).
export async function loadFontBytes(base = ""): Promise<FontBytes> {
  const get = async (f: string) => new Uint8Array(await (await fetch(`${base}/fonts/sarabun/${f}`)).arrayBuffer());
  const [regular, bold] = await Promise.all([get("Sarabun-Regular.ttf"), get("Sarabun-Bold.ttf")]);
  return { regular, bold };
}

// A PNG/JPEG logo from its bytes; anything else is left out.
export async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 4) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch { /* a broken image: no logo */ }
  return null;
}

export type DocFrame = {
  color: RGB;
  title: string;
  subtitle: string;
  // The doctor's brand (1.5.0): a logo or initials, then name / specialty / registration.
  brand: { logo: PDFImage | null; initials: string; name: string; specialty: string; registration: string } | null;
  // The template's own logo when there's no brand.
  logo: PDFImage | null;
  footer: string;
  // 1.8.0 F: every practice location, "Name · address · phone", one line
  // each above the footer text (2+ locations; the app's lib/pdf-utils).
  locationLines?: string[];
  signerName: string;
  signerRegistration: string | null;
  // A copy shared with the patient without a drawn signature says so (cf).
  unsignedLine: string | null;
  locale: string;
  // B's documents (spec B.0): the title centred in capitals under the brand,
  // no subtitle. The prescription keeps the app's left title + subtitle.
  centeredTitle?: boolean;
};

// Draws top-down. y is the next baseline's top; newPage keeps the frame.
export class Writer {
  page: PDFPage;
  y: number;
  readonly width = A4[0] - 2 * MARGIN;
  constructor(readonly pdf: PDFDocument, readonly fonts: Fonts, readonly frame: DocFrame) {
    this.page = pdf.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  static async create(frame: Omit<DocFrame, "brand" | "logo"> & {
    brand: (Omit<NonNullable<DocFrame["brand"]>, "logo"> & { logoBytes: Uint8Array | null }) | null;
    logoBytes: Uint8Array | null;
  }, fonts: FontBytes): Promise<Writer> {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const f: Fonts = {
      regular: await pdf.embedFont(fonts.regular, { subset: true }),
      bold: await pdf.embedFont(fonts.bold, { subset: true }),
    };
    const brand = frame.brand ? { ...frame.brand, logo: await embedImage(pdf, frame.brand.logoBytes) } : null;
    const logo = brand ? null : await embedImage(pdf, frame.logoBytes);
    const w = new Writer(pdf, f, { ...frame, brand, logo });
    w.header();
    return w;
  }

  // The footer's height: the divider, the location lines, the footer text.
  private get footerRoom(): number {
    return 40 + (this.frame.locationLines?.length ?? 0) * LOC_LH;
  }

  // Room for h points, else a new page.
  need(h: number) {
    if (this.y - h < MARGIN + this.footerRoom) {
      this.page = this.pdf.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  text(s: string, o: { size: number; bold?: boolean; color?: RGB; x?: number; maxWidth?: number; lineGap?: number }) {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const x = o.x ?? MARGIN;
    const lines = wrapText(s, font, o.size, o.maxWidth ?? this.width - (x - MARGIN), this.frame.locale);
    const lh = o.size * (o.lineGap ?? 1.35);
    for (const line of lines) {
      this.need(lh);
      this.y -= lh;
      drawShaped(this.page, line, { x, y: this.y + o.size * 0.25, font, size: o.size, color: o.color ?? INK });
    }
  }

  gap(h: number) { this.y -= h; }

  // A ticked box, then the text (fonts have no ☑ glyph; drawn instead).
  checked(s: string, o: { size: number }) {
    const font = this.fonts.regular;
    const lh = o.size * 1.35;
    const lines = wrapText(s, font, o.size, this.width - 16, this.frame.locale);
    lines.forEach((line, i) => {
      this.need(lh);
      this.y -= lh;
      const base = this.y + o.size * 0.25;
      if (i === 0) {
        const b = o.size * 0.8;
        this.page.drawRectangle({ x: MARGIN, y: base - 1, width: b, height: b, borderColor: INK, borderWidth: 0.8 });
        this.page.drawLine({ start: { x: MARGIN + b * 0.2, y: base - 1 + b * 0.5 }, end: { x: MARGIN + b * 0.42, y: base - 1 + b * 0.22 }, thickness: 1.1, color: INK });
        this.page.drawLine({ start: { x: MARGIN + b * 0.42, y: base - 1 + b * 0.22 }, end: { x: MARGIN + b * 0.85, y: base - 1 + b * 0.82 }, thickness: 1.1, color: INK });
      }
      drawShaped(this.page, line, { x: MARGIN + 16, y: base, font, size: o.size, color: INK });
    });
  }

  // One line, centred or right-aligned (wrapped to the width when longer).
  // A left text and a right-aligned one on the same line when both fit (the
  // Thai certificate's place and date, as on the paper form); else two lines.
  pair(left: string, right: string, o: { size: number }) {
    const font = this.fonts.regular;
    if (textWidth(font, left, o.size) + textWidth(font, right, o.size) + 12 > this.width) {
      this.text(left, o);
      this.aligned(right, "right", o);
      return;
    }
    const lh = o.size * 1.35;
    this.need(lh);
    this.y -= lh;
    const y = this.y + o.size * 0.25;
    drawShaped(this.page, left, { x: MARGIN, y, font, size: o.size, color: INK });
    drawShaped(this.page, right, { x: MARGIN + this.width - textWidth(font, right, o.size), y, font, size: o.size, color: INK });
  }

  aligned(s: string, align: "center" | "right", o: { size: number; bold?: boolean; color?: RGB }) {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const lh = o.size * 1.35;
    for (const line of wrapText(s, font, o.size, this.width, this.frame.locale)) {
      this.need(lh);
      this.y -= lh;
      const w = textWidth(font, line, o.size);
      const x = align === "center" ? MARGIN + (this.width - w) / 2 : MARGIN + this.width - w;
      drawShaped(this.page, line, { x, y: this.y + o.size * 0.25, font, size: o.size, color: o.color ?? INK });
    }
  }

  // A section: the small caps label, then its value lines.
  section(label: string, value: string, extra?: string) {
    this.need(40);
    this.text(label.toUpperCase(), { size: 8.5, color: FAINT });
    this.gap(2);
    this.text(value, { size: 11 });
    if (extra) this.text(extra, { size: 9.5, color: MUTED });
    this.gap(12);
  }

  private header() {
    const { brand, color, title, subtitle, logo } = this.frame;
    if (brand) {
      const top = this.y;
      let x = MARGIN;
      if (brand.logo) {
        const h = 40;
        const w = Math.min(160, (brand.logo.width / brand.logo.height) * h);
        this.page.drawImage(brand.logo, { x, y: top - h, width: w, height: h });
        x += w + 12;
      } else {
        this.page.drawCircle({ x: x + 18, y: top - 18, size: 18, color });
        const iw = textWidth(this.fonts.bold, brand.initials || "•", 12);
        drawShaped(this.page, brand.initials || "•", { x: x + 18 - iw / 2, y: top - 22, font: this.fonts.bold, size: 12, color: rgb(1, 1, 1) });
        x += 48;
      }
      drawShaped(this.page, brand.name, { x, y: top - 14, font: this.fonts.bold, size: 13, color: INK });
      let ly = top - 14;
      for (const s of [brand.specialty, brand.registration]) {
        if (!s) continue;
        ly -= 13;
        drawShaped(this.page, s, { x, y: ly, font: this.fonts.regular, size: 9.5, color: MUTED });
      }
      this.y = Math.min(top - 44, ly - 8) - 10;
    }
    if (this.frame.centeredTitle) {
      if (logo) {
        const h = 38;
        const w = Math.min(160, (logo.width / logo.height) * h);
        this.page.drawImage(logo, { x: MARGIN, y: this.y - h, width: w, height: h });
        this.y -= h + 8;
      }
      this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: this.width, height: 2, color });
      this.gap(24);
      this.aligned(title.toLocaleUpperCase(this.frame.locale), "center", { size: 15, bold: true, color });
      this.gap(20);
      return;
    }
    // Title + subtitle on the left, the template's logo on the right.
    const top = this.y;
    this.text(title, { size: 17, bold: true, color, maxWidth: this.width - (logo ? 170 : 0) });
    this.gap(2);
    this.text(subtitle, { size: 10, color: MUTED, maxWidth: this.width - (logo ? 170 : 0) });
    if (logo) {
      const h = 38;
      const w = Math.min(160, (logo.width / logo.height) * h);
      this.page.drawImage(logo, { x: A4[0] - MARGIN - w, y: top - h, width: w, height: h });
      this.y = Math.min(this.y, top - h);
    }
    this.gap(12);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 3, width: this.width, height: 3, color });
    this.gap(24);
  }

  // The signature area at the right: a line for the hand signature, the
  // name and registration under it, and the unsigned-copy line when set.
  signature() {
    const { signerName, signerRegistration, unsignedLine } = this.frame;
    this.need(110);
    this.gap(56);
    const w = 200;
    const x = A4[0] - MARGIN - w;
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + w, y: this.y }, thickness: 0.75, color: FAINT });
    const lines = [signerName, signerRegistration ?? ""].filter(Boolean);
    let y = this.y;
    for (const l of lines) {
      y -= 13;
      const lw = textWidth(this.fonts.regular, l, 9.5);
      drawShaped(this.page, l, { x: x + (w - lw) / 2, y, font: this.fonts.regular, size: 9.5, color: MUTED });
    }
    if (unsignedLine) {
      for (const l of wrapText(unsignedLine, this.fonts.regular, 8.5, w + 40, this.frame.locale)) {
        y -= 12;
        const lw = textWidth(this.fonts.regular, l, 8.5);
        drawShaped(this.page, l, { x: x + (w - lw) / 2, y, font: this.fonts.regular, size: 8.5, color: FAINT });
      }
    }
    this.y = y - 8;
  }

  // The footer on every page, then the bytes.
  async finish(): Promise<Uint8Array> {
    const lines = this.frame.locationLines ?? [];
    for (const p of this.pdf.getPages()) {
      p.drawLine({ start: { x: MARGIN, y: MARGIN + 18 + lines.length * LOC_LH }, end: { x: A4[0] - MARGIN, y: MARGIN + 18 + lines.length * LOC_LH }, thickness: 0.75, color: LINE });
      lines.forEach((l, i) => {
        // A long line shrinks to fit (down to 6 pt), then is cut with "…".
        let size = 8;
        let text = l;
        const full = textWidth(this.fonts.regular, text, size);
        if (full > this.width) size = Math.max(6, (size * this.width) / full);
        while (text.length > 1 && textWidth(this.fonts.regular, text, size) > this.width) text = `${text.slice(0, -2).trimEnd()}…`;
        const lw = textWidth(this.fonts.regular, text, size);
        drawShaped(p, text, { x: Math.max(MARGIN, (A4[0] - lw) / 2), y: MARGIN + (lines.length - i) * LOC_LH, font: this.fonts.regular, size, color: FAINT });
      });
      const fw = textWidth(this.fonts.regular, this.frame.footer, 8.5);
      drawShaped(p, this.frame.footer, { x: (A4[0] - fw) / 2, y: MARGIN, font: this.fonts.regular, size: 8.5, color: FAINT });
    }
    this.pdf.setCreator("SolvyMed");
    this.pdf.setProducer("SolvyMed");
    return this.pdf.save();
  }
}
