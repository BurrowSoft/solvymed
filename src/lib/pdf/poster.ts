import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import qrcode from "qrcode-generator";
import type { Design } from "@/lib/studio/design";
import { embedDesignFonts } from "./fonts";
import { A4, embedImage, hexColor, type FontBytes } from "./document";
import { drawShaped, textWidth, wrapText } from "./text";

// Document Studio PR5: posters and social images in the practice's design
// (02, 10-13). Four templates; A4 / A3 print (PDF) and Instagram post /
// story (PNG, rasterised on the device). Never patient data and never a
// signature: there is no input for either. The doctor's name and
// registration line are always printed (ad rules: 02, lawyer list); the
// specialty and a price only where the country config allows them (the
// caller passes them or null).

export type PosterFormat = "a4" | "a3" | "post" | "story";

export type PosterContent =
  | { kind: "hours"; title: string; rows: { day: string; hours: string }[]; note: string | null }
  | { kind: "service"; title: string; text: string; price: string | null; note: string | null }
  | { kind: "announcement"; title: string; text: string }
  | { kind: "booking"; title: string; qrUrl: string; scanLabel: string; linkText: string };

export type PosterInput = {
  design: Design;
  locale: string;
  practice: { displayName: string; specialty: string | null; registrationLine: string | null; clinicName: string | null };
  // The footer contacts' values (phone, WhatsApp, site…), as the design lists them.
  contacts: string[];
  logos: { square: Uint8Array | null; reversed: Uint8Array | null };
  content: PosterContent;
  format: PosterFormat;
};

// Page sizes in points. The social formats are drawn at half their pixel
// size and rasterised ×2 (post 1080×1080, story 1080×1920).
export const POSTER_SIZES: Record<Exclude<PosterFormat, "a3">, [number, number]> = {
  a4: A4,
  post: [540, 540],
  story: [540, 960],
};
const A3: [number, number] = [841.89, 1190.55];
export const POSTER_PNG_WIDTH = 1080;

const WHITE = rgb(1, 1, 1);

// draw: false = measure only (a first pass centres each block vertically).
type Ctx = { page: PDFPage; fonts: { regular: PDFFont; bold: PDFFont }; W: number; H: number; locale: string; draw: boolean };

function text(c: Ctx, s: string, o: { y: number; size: number; bold?: boolean; color: RGB; width?: number; x?: number; align?: "center" | "left" | "right"; spacing?: number; maxLines?: number }): number {
  const font = o.bold ? c.fonts.bold : c.fonts.regular;
  const w = o.width ?? c.W * 0.84;
  const x0 = o.x ?? (c.W - w) / 2;
  let lines = wrapText(s, font, o.size, w, c.locale);
  if (o.maxLines && lines.length > o.maxLines) lines = lines.slice(0, o.maxLines);
  let y = o.y;
  const lh = o.size * (o.spacing ?? 1.25);
  for (const l of lines) {
    y -= lh;
    const tw = textWidth(font, l, o.size);
    const x = o.align === "left" ? x0 : o.align === "right" ? x0 + w - tw : x0 + (w - tw) / 2;
    if (c.draw) drawShaped(c.page, l, { x, y: y + o.size * 0.25, font, size: o.size, color: o.color });
  }
  return y;
}

function drawQr(page: PDFPage, url: string, x: number, y: number, side: number) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = side / (n + quiet * 2);
  page.drawRectangle({ x, y, width: side, height: side, color: WHITE });
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) page.drawRectangle({ x: x + (col + quiet) * cell, y: y + side - (r + quiet + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: rgb(0, 0, 0) });
    }
  }
}

async function drawPoster(pdf: PDFDocument, input: PosterInput, size: [number, number], fonts: { regular: PDFFont; bold: PDFFont }) {
  const [W, H] = size;
  const page = pdf.addPage(size);
  const c: Ctx = { page, fonts, W, H, locale: input.locale, draw: true };
  const d = input.design;
  const primary = hexColor(d.palette.primary), accent = hexColor(d.palette.accent), light = hexColor(d.palette.light);
  const ink = hexColor("#1F2A2E"), muted = hexColor("#5D6B70");
  const u = W / 595; // one A4 point, scaled to this page
  const square = H / W < 1.2; // the Instagram post

  // Paper and the top block in the main colour (logo, name, credentials).
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: light });
  const topH = H * (square ? 0.26 : 0.2);
  page.drawRectangle({ x: 0, y: H - topH, width: W, height: topH, color: primary });
  const logo = (await embedImage(pdf, input.logos.reversed)) ?? (await embedImage(pdf, input.logos.square));
  const name = d.nameBlock.style === "spaced" ? input.practice.displayName.toLocaleUpperCase(input.locale) : input.practice.displayName;
  const cred = [input.practice.specialty, input.practice.registrationLine].filter((x): x is string => !!x?.trim()).join(" · ");
  const header = (y: number) => {
    if (logo) {
      const side = topH * 0.36;
      const sc = Math.min(side / logo.width, side / logo.height);
      if (c.draw) page.drawImage(logo, { x: (W - logo.width * sc) / 2, y: y - logo.height * sc, width: logo.width * sc, height: logo.height * sc });
      y -= side + 6 * u;
    }
    y = text(c, name, { y, size: (d.nameBlock.style === "large" ? 26 : 22) * u, bold: true, color: WHITE, maxLines: 1 });
    if (cred) y = text(c, cred, { y: y - 2 * u, size: 12 * u, color: WHITE, maxLines: 2 });
    return y;
  };
  c.draw = false;
  const headerH = H - header(H);
  c.draw = true;
  header(H - (topH - headerH) / 2);

  // The bottom: contacts and the clinic's name, then the accent band.
  const bandH = 14 * u;
  page.drawRectangle({ x: 0, y: 0, width: W, height: bandH, color: accent });
  const foot = [input.practice.clinicName, ...input.contacts].filter((x): x is string => !!x?.trim()).join("  ·  ");
  const footTop = bandH + 16 * u + (foot ? 26 * u : 0);
  if (foot) text(c, foot, { y: footTop - 4 * u, size: 11 * u, color: muted, maxLines: 2 });

  // The template's content, between the top block and the footer.
  const regionTop = H - topH - (square ? 18 : 30) * u;
  const regionBottom = footTop + (square ? 8 : 16) * u;
  const ct = input.content;
  const body = (startY: number) => {
  let cy = text(c, ct.title, { y: startY, size: (square ? 30 : 36) * u, bold: true, color: primary, maxLines: 3 });
  cy -= (square ? 12 : 22) * u;
  if (ct.kind === "hours") {
    const rowSize = (square ? 13 : 16) * u;
    const w = W * 0.64, x = (W - w) / 2;
    for (const r of ct.rows) {
      const y0 = cy;
      text(c, r.day, { y: y0, size: rowSize, bold: true, color: ink, width: w, x, align: "left", maxLines: 1 });
      cy = text(c, r.hours, { y: y0, size: rowSize, color: ink, width: w, x, align: "right", maxLines: 2 });
      cy -= 6 * u;
      if (c.draw) page.drawRectangle({ x, y: cy + 2 * u, width: w, height: 0.6, color: hexColor("#D9DED9") });
    }
    if (ct.note?.trim()) cy = text(c, ct.note, { y: cy - 10 * u, size: 12 * u, color: muted, maxLines: 3 });
  } else if (ct.kind === "service" || ct.kind === "announcement") {
    cy = text(c, ct.text, { y: cy, size: (square ? 15 : 18) * u, color: ink, spacing: 1.4, maxLines: square ? 6 : 12 });
    if (ct.kind === "service" && ct.price?.trim()) cy = text(c, ct.price, { y: cy - 18 * u, size: 30 * u, bold: true, color: accent, maxLines: 1 });
    if (ct.kind === "service" && ct.note?.trim()) cy = text(c, ct.note, { y: cy - 10 * u, size: 12 * u, color: muted, maxLines: 3 });
  } else {
    const room = cy - regionBottom - 50 * u;
    const side = Math.max(90 * u, Math.min(W * 0.46, room));
    if (c.draw) drawQr(page, ct.qrUrl, (W - side) / 2, cy - side, side);
    cy -= side + 6 * u;
    cy = text(c, ct.scanLabel, { y: cy, size: 15 * u, bold: true, color: ink, maxLines: 1 });
    cy = text(c, ct.linkText, { y: cy, size: 10 * u, color: muted, maxLines: 2 });
  }
  return cy;
  };
  c.draw = false;
  const bodyH = regionTop - body(regionTop);
  c.draw = true;
  body(regionTop - Math.max(0, (regionTop - regionBottom - bodyH) / 2));
}

// The poster as a PDF: A4, A3 (the A4 page scaled, vector), or the social
// sizes (rasterised to PNG by the caller).
export async function renderPoster(input: PosterInput, fontBytes: FontBytes): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await embedDesignFonts(pdf, input.design.font, fontBytes);
  if (input.format !== "a3") {
    await drawPoster(pdf, input, POSTER_SIZES[input.format], fonts);
    return pdf.save();
  }
  // A3: draw the A4 poster, then place it ×√2 on an A3 page.
  const inner = await PDFDocument.create();
  inner.registerFontkit(fontkit);
  const innerFonts = await embedDesignFonts(inner, input.design.font, fontBytes);
  await drawPoster(inner, { ...input, format: "a4" }, A4, innerFonts);
  const [embedded] = await pdf.embedPdf(await inner.save(), [0]);
  const page = pdf.addPage(A3);
  page.drawPage(embedded, { x: 0, y: 0, width: A3[0], height: A3[1] });
  void fonts;
  return pdf.save();
}
