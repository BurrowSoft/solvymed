import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Design, PaletteRef } from "@/lib/studio/design";
import { bandHeight, presetFor, type LayoutPreset } from "@/lib/studio/layouts";
import { embedDesignFonts } from "./fonts";
import { A4, embedImage, hexColor, type FontBytes, type Fonts } from "./document";
import { drawShaped, textWidth, wrapText } from "./text";

// Document Studio PR2: a document drawn in a saved design's layout (the
// approved mock-ups, specs/studio-layouts). The layout's structure comes
// from its preset (lib/studio/layouts: data, an unknown id draws Classic);
// the doctor's choices (palette, font, name block, logo use, watermark,
// section bars, fields, footer, band) from the design. Content flows top
// down; the signature, the footer and the band are anchored at the bottom,
// and the footer always ends above the band (Vitor 10-13).

export type DesignedInput = {
  design: Design;
  locale: string;
  practice: {
    displayName: string;
    specialty: string | null;
    registrationLine: string | null;
    clinicName: string | null;
    locations: { name: string; lines: string[] }[];
  };
  logos: { square: Uint8Array | null; wide: Uint8Array | null; reversed: Uint8Array | null };
  // What the document says, as blocks (lib/studio/content builds them per
  // document type, in the order today's PDFs use).
  // headerText / footerText: the design's texts for this document type
  // (design.texts, carried over from Document Templates): a muted line under
  // the title, a small line above the footer.
  doc: { title: string; blocks: DocBlock[]; unsignedLine?: string | null; headerText?: string | null; footerText?: string | null };
};

export type DocBlock =
  | { kind: "fields"; cells: [string, string][] }
  | { kind: "items"; items: { name: string; form?: string | null; instructions: string }[] }
  | { kind: "notes"; label: string; text: string }
  | { kind: "section"; label: string }
  | { kind: "paragraph"; text: string; muted?: boolean; bold?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "checked"; text: string }
  | { kind: "dateLine"; text: string };

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  fonts: Fonts;
  p: LayoutPreset;
  d: Design;
  ink: RGB;
  muted: RGB;
  color: (ref: PaletteRef | "muted" | "white" | "ink") => RGB;
  // The content column.
  left: number;
  width: number;
  y: number;
  locale: string;
};

const WHITE = rgb(1, 1, 1);

function line(c: Ctx, text: string, o: { size: number; bold?: boolean; color?: RGB; x?: number; align?: "left" | "center" | "right"; width?: number; spacing?: number; upper?: boolean }) {
  const font = o.bold ? c.fonts.bold : c.fonts.regular;
  const s = o.upper ? text.toLocaleUpperCase(c.locale) : text;
  const w = o.width ?? c.width;
  const x0 = o.x ?? c.left;
  const lines = wrapText(s, font, o.size, w, c.locale);
  const lh = o.size * (o.spacing ?? 1.4);
  for (const l of lines) {
    c.y -= lh;
    const tw = textWidth(font, l, o.size);
    const x = o.align === "center" ? x0 + (w - tw) / 2 : o.align === "right" ? x0 + w - tw : x0;
    drawShaped(c.page, l, { x, y: c.y + o.size * 0.28, font, size: o.size, color: o.color ?? c.ink });
  }
}

function rule(c: Ctx, color: RGB, thickness = 1, x = c.left, w = c.width) {
  c.page.drawRectangle({ x, y: c.y - thickness, width: w, height: thickness, color });
  c.y -= thickness;
}

// The page itself: paper, watermark, sidebar, bottom band.
function drawPage(c: Ctx, wm: PDFImage | null) {
  const [W, H] = A4;
  if (c.p.paper === "light") c.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: c.color("light") });
  if (c.p.sidebar > 0) c.page.drawRectangle({ x: 0, y: 0, width: c.p.sidebar, height: H, color: c.color("primary") });
  if (wm && c.d.watermark.on) {
    const side = { s: 260, m: 330, l: 390 }[c.d.watermark.size];
    c.page.drawImage(wm, { x: (W - side) / 2, y: (H - side) / 2 - 20, width: side, height: side, opacity: c.d.watermark.opacity });
  }
  const bh = bandHeight(c.d.band.style);
  if (bh > 0) {
    const cols = c.d.band.colors.length ? c.d.band.colors : (["primary"] as PaletteRef[]);
    if (c.d.band.style === "twoTone") {
      const a = (W * 3) / 4;
      c.page.drawRectangle({ x: 0, y: 0, width: a, height: bh, color: c.color(cols[0]) });
      c.page.drawRectangle({ x: a, y: 0, width: W - a, height: bh, color: c.color(cols[1] ?? cols[0]) });
    } else if (c.d.band.style === "angled") {
      const from = c.p.sidebar;
      // pdf-lib draws SVG paths with y pointing down from (x, y): origin at the band's top.
      c.page.drawSvgPath(`M ${from} ${bh} L ${W} 0 L ${W} ${bh} Z`, { x: 0, y: bh, color: c.color(cols[0]) });
    } else if (c.d.band.style === "rounded") {
      const r = bh;
      c.page.drawRectangle({ x: r, y: 0, width: W - 2 * r, height: bh, color: c.color(cols[0]) });
      c.page.drawCircle({ x: r, y: 0, size: r, color: c.color(cols[0]) });
      c.page.drawCircle({ x: W - r, y: 0, size: r, color: c.color(cols[0]) });
    } else {
      c.page.drawRectangle({ x: 0, y: 0, width: W, height: bh, color: c.color(cols[0]) });
    }
  }
}

function headerLogo(c: Ctx, logos: { square: PDFImage | null; wide: PDFImage | null; reversed: PDFImage | null }): PDFImage | null {
  const use = c.d.logoUse.header;
  if (use === "none") return null;
  if (use === "reversed") return logos.reversed ?? logos.square;
  if (use === "wide") return logos.wide ?? logos.square;
  return logos.square ?? logos.wide;
}

function nameSize(c: Ctx): number {
  const s = c.p.size.name;
  return c.d.nameBlock.style === "large" ? s * 1.15 : s;
}

function drawHeader(c: Ctx, input: DesignedInput, logo: PDFImage | null) {
  const pr = input.practice;
  const cred = [pr.specialty, pr.registrationLine].filter(Boolean).join(" · ");
  const spaced = c.d.nameBlock.style === "spaced";
  if (c.p.header === "logoLeft") {
    const top = c.y;
    const box = 54;
    if (logo) {
      const sc = Math.min(box / logo.width, box / logo.height);
      c.page.drawImage(logo, { x: c.left, y: top - logo.height * sc, width: logo.width * sc, height: logo.height * sc });
    }
    const textX = c.left + (logo ? box + 18 : 0);
    const textW = c.width - (logo ? box + 18 : 0);
    line(c, pr.displayName, { size: nameSize(c), bold: true, align: "right", x: textX, width: textW, upper: spaced });
    if (cred) line(c, cred, { size: c.p.size.body, color: c.muted, align: "right", x: textX, width: textW });
    if (pr.clinicName) line(c, pr.clinicName, { size: c.p.size.body, color: c.muted, align: "right", x: textX, width: textW });
    c.y = Math.min(c.y, top - box) - 13;
    rule(c, c.color("primary"), 1.5);
  } else if (c.p.header === "centered") {
    if (logo) {
      const side = 48;
      const sc = Math.min(side / logo.width, side / logo.height);
      c.page.drawImage(logo, { x: c.left + (c.width - logo.width * sc) / 2, y: c.y - logo.height * sc, width: logo.width * sc, height: logo.height * sc });
      c.y -= side + 6;
    }
    line(c, pr.displayName, { size: nameSize(c), align: "center", upper: spaced, spacing: 1.2 });
    if (cred) line(c, cred, { size: c.p.size.small, color: c.muted, align: "center", upper: true });
    c.y -= 6;
    rule(c, c.color("accent"), 0.75, c.left + (c.width - 90) / 2, 90);
  } else if (c.p.header === "sidebar") {
    // The reversed logo sits in the coloured column; the name block in the content column.
    if (logo) {
      const side = 63;
      const sc = Math.min(side / logo.width, side / logo.height);
      c.page.drawImage(logo, { x: (c.p.sidebar - logo.width * sc) / 2, y: A4[1] - 36 - logo.height * sc, width: logo.width * sc, height: logo.height * sc });
    }
    line(c, pr.displayName, { size: nameSize(c), bold: true, spacing: 1.15, upper: spaced });
    if (cred) line(c, cred, { size: c.p.size.body, color: c.color("primary") });
  } else {
    const top = c.y;
    line(c, pr.displayName, { size: nameSize(c), upper: true, spacing: 1.2 });
    const reg = pr.registrationLine ?? "";
    if (reg) {
      const y = c.y;
      c.y = top;
      line(c, reg, { size: c.p.size.small, align: "right", color: c.color("accent"), upper: true });
      c.y = Math.min(y, c.y);
    }
    c.y -= 10;
    rule(c, c.color("accent"), 0.75);
  }
}

function drawTitle(c: Ctx, title: string) {
  const sb = c.d.sectionBar;
  if (c.p.title === "bar" && sb.fill !== "none") {
    const h = c.p.size.title * 2.2;
    c.page.drawRectangle({ x: c.left, y: c.y - h, width: c.width, height: h, color: c.color(sb.fill) });
    const font = c.fonts.bold;
    const s = sb.upper ? title.toLocaleUpperCase(c.locale) : title;
    drawShaped(c.page, s, { x: c.left + 10, y: c.y - h / 2 - c.p.size.title * 0.35, font, size: c.p.size.title, color: c.color(sb.text) });
    c.y -= h;
  } else if (c.p.title === "ruled") {
    const s = sb.upper ? title.toLocaleUpperCase(c.locale) : title;
    const tw = textWidth(c.fonts.bold, s, c.p.size.title);
    c.y -= c.p.size.title * 1.4;
    drawShaped(c.page, s, { x: c.left, y: c.y + c.p.size.title * 0.28, font: c.fonts.bold, size: c.p.size.title, color: c.color(sb.text === "white" ? "primary" : sb.text) });
    c.page.drawRectangle({ x: c.left + tw + 9, y: c.y + c.p.size.title * 0.6, width: c.width - tw - 9, height: 1.5, color: c.color("accent") });
  } else if (c.p.header !== "nameOnly") {
    line(c, title, { size: c.p.size.title, bold: true, upper: sb.upper });
  } else {
    // Minimal: a small muted title, still there (02: a document always
    // states what it is).
    line(c, title, { size: c.p.size.small, color: c.muted, upper: true });
  }
}

function drawFields(c: Ctx, cells: [string, string][]) {
  const f = c.d.field;
  const half = (c.width - 18) / 2;
  const top = c.y;
  let bottom = top;
  cells.forEach(([label, value], i) => {
    c.y = top;
    const x = c.left + i * (half + 18);
    if (c.p.header === "nameOnly") {
      // Minimal: small muted labels over the values (02: never ambiguous).
      if (label) line(c, label, { size: c.p.size.small * 0.9, x, width: half, align: i ? "right" : "left", color: c.muted });
      line(c, value, { size: c.p.size.body * 0.93, x, width: half, align: i ? "right" : "left", color: i ? c.muted : c.ink });
    } else if (f.style === "box") {
      const h = c.p.size.body * 3.1;
      c.page.drawRectangle({ x, y: top - h, width: half, height: h, color: c.color(f.line === "muted" ? "light" : f.line) });
      c.y = top - 6;
      line(c, label, { size: c.p.size.small, x: x + 9, width: half - 18, color: c.muted });
      line(c, value, { size: c.p.size.body, x: x + 9, width: half - 18 });
      c.y = top - h;
    } else if (f.style === "underline") {
      line(c, label, { size: c.p.size.small, x, width: half, color: c.muted });
      line(c, value, { size: c.p.size.body, x, width: half });
      c.y -= 3;
      rule(c, c.color(f.line), 0.75, x, half);
    } else {
      line(c, `${label}: ${value}`, { size: c.p.size.body, x, width: half });
    }
    bottom = Math.min(bottom, c.y);
  });
  c.y = bottom;
}

function drawItems(c: Ctx, items: { name: string; form?: string | null; instructions: string }[]) {
  items.forEach((it, i) => {
    const head = it.form ? `${it.name} · ${it.form}` : it.name;
    if (c.p.items === "numbered") {
      const r = 9.75;
      const cy = c.y - r - 2;
      c.page.drawCircle({ x: c.left + r, y: cy, size: r, color: c.color("primary") });
      const n = String(i + 1);
      drawShaped(c.page, n, { x: c.left + r - textWidth(c.fonts.regular, n, 10) / 2, y: cy - 3.5, font: c.fonts.regular, size: 10, color: WHITE });
      const x = c.left + 2 * r + 10.5;
      line(c, head, { size: c.p.size.body, bold: true, x, width: c.width - (x - c.left) });
      line(c, it.instructions, { size: c.p.size.body, x, width: c.width - (x - c.left) });
    } else if (c.p.items === "list") {
      const n = `${i + 1}.`;
      const x = c.left + 15;
      const y0 = c.y;
      line(c, head, { size: c.p.size.body, bold: true, x, width: c.width - 15 });
      drawShaped(c.page, n, { x: c.left, y: y0 - c.p.size.body * 1.4 + c.p.size.body * 0.28, font: c.fonts.regular, size: c.p.size.body, color: c.ink });
      line(c, it.instructions, { size: c.p.size.body, x, width: c.width - 15 });
    } else if (c.p.items === "titled") {
      line(c, head, { size: c.p.size.body * 1.2 });
      line(c, it.instructions, { size: c.p.size.body });
    } else {
      line(c, head, { size: c.p.size.body, bold: true });
      line(c, it.instructions, { size: c.p.size.body });
    }
    c.y -= c.p.gap * 0.55;
  });
}

function drawNotes(c: Ctx, label: string, text: string) {
  if (c.p.title === "bar" && c.d.sectionBar.fill !== "none") {
    drawTitle(c, label);
    c.y -= 6;
    line(c, text, { size: c.p.size.body });
  } else if (c.p.header === "nameOnly") {
    line(c, text, { size: c.p.size.body, color: c.muted });
  } else {
    line(c, `${label}: ${text}`, { size: c.p.size.body });
  }
}

// A section heading inside the document (e.g. "I request:", the findings):
// the layout's section bar when it has one, else a bold line.
function drawSection(c: Ctx, label: string) {
  if (c.p.title === "bar" && c.d.sectionBar.fill !== "none") { drawTitle(c, label); c.y -= 6; }
  else line(c, label, { size: c.p.size.body, bold: true });
}

function drawBlock(c: Ctx, b: DocBlock) {
  const body = c.p.size.body;
  switch (b.kind) {
    case "fields": drawFields(c, b.cells); c.y -= c.p.gap; return;
    case "items": drawItems(c, b.items); return;
    case "notes": drawNotes(c, b.label, b.text); return;
    case "section": drawSection(c, b.label); return;
    case "paragraph": line(c, b.text, { size: body, color: b.muted ? c.muted : c.ink, bold: b.bold, spacing: 1.55 }); c.y -= c.p.gap * 0.4; return;
    case "bullets": for (const t of b.items) line(c, `•  ${t}`, { size: body, x: c.left + 12, width: c.width - 12 }); c.y -= c.p.gap * 0.4; return;
    case "checked": {
      const s = body * 0.75;
      const y0 = c.y;
      line(c, b.text, { size: body, x: c.left + s + 8, width: c.width - s - 8 });
      const by = y0 - body * 1.4 + body * 0.2;
      c.page.drawRectangle({ x: c.left, y: by, width: s, height: s, borderColor: c.ink, borderWidth: 0.75 });
      c.page.drawLine({ start: { x: c.left + s * 0.2, y: by + s * 0.5 }, end: { x: c.left + s * 0.42, y: by + s * 0.22 }, thickness: 1, color: c.ink });
      c.page.drawLine({ start: { x: c.left + s * 0.42, y: by + s * 0.22 }, end: { x: c.left + s * 0.85, y: by + s * 0.82 }, thickness: 1, color: c.ink });
      c.y -= c.p.gap * 0.4;
      return;
    }
    case "dateLine": c.y -= c.p.gap * 0.4; line(c, b.text, { size: body, align: "right" }); return;
  }
}

// The footer's groups: each location (its name, then its lines), then the
// contacts (not in a sidebar layout: those go in the column).
type FooterGroup = { lines: string[]; titled: boolean };
function footerGroups(c: Ctx, input: DesignedInput): FooterGroup[] {
  const groups: FooterGroup[] = [];
  if (c.d.footer.locations) for (const l of input.practice.locations) groups.push({ lines: [l.name, ...l.lines], titled: true });
  if (c.d.footer.contacts.length && c.p.sidebar === 0) groups.push({ lines: c.d.footer.contacts.map((ct) => ct.value), titled: false });
  return groups;
}
// Into the design's column count: extra groups join the last column.
function footerColumns(groups: FooterGroup[], columns: number): FooterGroup[][] {
  const n = Math.max(1, Math.min(columns, groups.length || 1));
  if (groups.length <= n) return groups.map((g) => [g]);
  return [...groups.slice(0, n - 1).map((g) => [g]), groups.slice(n - 1)];
}

// The signature, then the footer, measured from the bottom: the footer ends
// above the band, whatever its length.
function drawBottom(c: Ctx, input: DesignedInput) {
  const size = c.p.size.small;
  const lh = size * 1.5;
  const groups = footerGroups(c, input);
  const base = Math.max(c.p.padding[2], bandHeight(c.d.band.style) + 14);
  let footerH = 0;
  if (groups.length && c.d.footer.columns === 1 && c.p.footer.oneLine !== "none") {
    // One joined line, measured first so it ends above the band. A long one
    // breaks only between items (an address part, a phone number, a handle),
    // never inside one (02: Minimal's footer split a phone number).
    const caps = c.p.footer.oneLine === "caps";
    const up = (t: string) => (caps ? t.toLocaleUpperCase(c.locale) : t);
    const sep = caps ? "  ·  " : "  |  ";
    const parts = groups.flatMap((g, gi) => g.lines.map((t, li) => ({ text: up(t), joiner: li === 0 ? (gi === 0 ? "" : sep) : " · " })));
    const rows: string[] = [];
    let cur = "";
    for (const p of parts) {
      const next = cur ? cur + p.joiner + p.text : p.text;
      if (cur && textWidth(c.fonts.regular, next, size) > c.width) { rows.push(cur); cur = p.text; } else cur = next;
    }
    if (cur) rows.push(cur);
    footerH = rows.length * lh + 10;
    c.y = base + footerH;
    for (const r of rows) line(c, r, { size, color: c.muted, align: caps ? "center" : "left", spacing: 1.5 });
  } else if (groups.length) {
    const cols = footerColumns(groups, c.d.footer.columns);
    const rows = Math.max(...cols.map((col) => col.reduce((n, g) => n + g.lines.length, 0)));
    footerH = rows * lh + 10;
    const gap = 12;
    const w = (c.width - gap * (cols.length - 1)) / cols.length;
    cols.forEach((col, i) => {
      c.y = base + footerH;
      const align = cols.length > 1 && i === cols.length - 1 ? "right" : "left";
      for (const g of col) g.lines.forEach((t, j) => {
        const title = g.titled && j === 0;
        line(c, t, { size, x: c.left + i * (w + gap), width: w, color: title ? c.ink : c.muted, bold: title, align, spacing: 1.5 });
      });
    });
  }
  if (groups.length && c.p.footer.rule) {
    c.y = base + footerH + 6;
    rule(c, hexColor("#D9DED9"), 0.75);
  }
  // The type's footer text: above the footer (and its rule); the signature
  // moves up by its height.
  const footerText = input.doc.footerText?.trim();
  if (footerText) {
    const n = wrapText(footerText, c.fonts.regular, size, c.width, c.locale).length;
    const top = base + footerH + (groups.length ? 12 : 0) + n * lh;
    c.y = top;
    line(c, footerText, { size, color: c.muted, spacing: 1.5 });
    footerH = top - base;
  }
  // Sidebar layouts put the contacts in the column.
  if (c.p.sidebar > 0 && c.d.footer.contacts.length) {
    const saved = { left: c.left, width: c.width, y: c.y };
    c.left = 12; c.width = c.p.sidebar - 24; c.y = base + c.d.footer.contacts.length * lh + 20;
    for (const ct of c.d.footer.contacts) line(c, ct.value, { size, align: "center", color: c.color("light"), spacing: 1.5 });
    Object.assign(c, saved);
  }
  // Signature above the footer.
  const sig = c.p.signature;
  const sx = sig.align === "center" ? c.left + (c.width - sig.width) / 2 : c.left + c.width - sig.width;
  const sigTop = base + footerH + 24 + c.p.size.body * 1.4 + c.p.size.small * 1.4 + 6;
  c.y = sigTop;
  c.page.drawRectangle({ x: sx, y: c.y - 0.75, width: sig.width, height: 0.75, color: c.ink });
  c.y -= 4;
  line(c, input.practice.displayName, { size: c.p.size.body, bold: true, x: sx, width: sig.width, align: sig.align });
  const cred = [input.practice.specialty, input.practice.registrationLine].filter(Boolean).join(" · ");
  if (cred) line(c, cred, { size: c.p.size.small, x: sx, width: sig.width, align: sig.align, color: c.muted });
  // A patient's copy (unsigned): its line under the signature block.
  if (input.doc.unsignedLine) line(c, input.doc.unsignedLine, { size: c.p.size.small * 0.9, x: sx, width: sig.width, align: sig.align, color: c.muted });
}

export async function renderDesignedDocument(input: DesignedInput, fontBytes: FontBytes): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await embedDesignFonts(pdf, input.design.font, fontBytes);
  const d = input.design;
  const p = presetFor(d.layout);
  const palette = { primary: hexColor(d.palette.primary), accent: hexColor(d.palette.accent), light: hexColor(d.palette.light) };
  const ink = hexColor(p.ink);
  const muted = hexColor(p.muted);
  const color = (ref: PaletteRef | "muted" | "white" | "ink") => (ref === "white" ? WHITE : ref === "ink" ? ink : ref === "muted" ? muted : palette[ref]);
  const logos = {
    square: await embedImage(pdf, input.logos.square),
    wide: await embedImage(pdf, input.logos.wide),
    reversed: await embedImage(pdf, input.logos.reversed),
  };
  const page = pdf.addPage(A4);
  const [, H] = A4;
  const left = p.sidebar + p.padding[3];
  const c: Ctx = { pdf, page, fonts, p, d, ink, muted, color, left, width: A4[0] - left - p.padding[1], y: H - p.padding[0], locale: input.locale };
  drawPage(c, d.watermark.logo === "wide" ? logos.wide ?? logos.square : logos.square ?? logos.wide);
  drawHeader(c, input, headerLogo(c, logos));
  c.y -= p.gap;
  drawTitle(c, input.doc.title);
  const headerText = input.doc.headerText?.trim();
  if (headerText) {
    c.y -= 4;
    line(c, headerText, { size: p.size.body, color: muted });
  }
  c.y -= p.gap * 0.6;
  for (const b of input.doc.blocks) drawBlock(c, b);
  drawBottom(c, input);
  return pdf.save();
}
