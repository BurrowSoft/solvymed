import { layoutFor, type KnownLayout } from "./design";

// The layouts as DATA (Vitor 10-14): what makes Classic, Elegant, Modern
// and Minimal different is described here, read by the renderers (web
// pdf-lib; the app mirrors this file for its HTML renderer). A new layout =
// a new entry + its golden images. Measures come from the approved mock-ups
// (specs/studio-layouts/*.dc.html, A4 794 x 1123 px), in PDF points
// (1 px = 0.75 pt on A4: 595.28 x 841.89 pt). The design's own choices
// (palette, font, name block, logo use, watermark, section bars, fields,
// footer, band) are applied on top; a preset only sets the structure and
// the defaults those choices don't cover.

export type HeaderKind =
  | "logoLeft" // Classic: logo left, name block right, a rule under it
  | "centered" // Elegant: logo, name, credential, a short accent rule, centred
  | "sidebar" // Modern: a coloured column with the reversed logo and contacts
  | "nameOnly"; // Minimal: name left, registration right, a hairline

export type ItemKind = "list" | "titled" | "numbered" | "plain";

export type LayoutPreset = {
  id: KnownLayout;
  // Page padding (top, right, bottom, left), points.
  padding: [number, number, number, number];
  // Space between blocks.
  gap: number;
  header: HeaderKind;
  // The left column (sidebar layouts), points; 0 = none.
  sidebar: number;
  // The document title: plain text, or the design's section bar.
  title: "plain" | "bar" | "ruled";
  items: ItemKind;
  signature: { align: "center" | "right"; width: number };
  // The footer: a hairline above it (Classic); a one-column footer as one
  // joined line (Modern plain, Minimal centred in small capitals) or
  // stacked; sidebar layouts put the contacts in the column.
  footer: { rule: boolean; oneLine: "none" | "plain" | "caps" };
  // The page background: white, or the palette's light colour.
  paper: "white" | "light";
  // Text colours, as hex (not part of the design: legibility).
  ink: string;
  muted: string;
  // Sizes, points.
  size: { body: number; name: number; title: number; small: number };
};

const PX = 0.75;
const px = (v: number) => Math.round(v * PX * 100) / 100;

export const LAYOUT_PRESETS: Record<KnownLayout, LayoutPreset> = {
  classic: {
    id: "classic",
    padding: [px(56), px(64), px(40), px(64)],
    gap: px(24),
    header: "logoLeft",
    sidebar: 0,
    title: "plain",
    items: "list",
    signature: { align: "center", width: px(300) },
    footer: { rule: true, oneLine: "none" },
    paper: "white",
    ink: "#1F2A24",
    muted: "#4A5650",
    size: { body: px(14), name: px(22), title: px(18), small: px(11) },
  },
  elegant: {
    id: "elegant",
    padding: [px(56), px(72), px(46), px(72)],
    gap: px(26),
    header: "centered",
    sidebar: 0,
    title: "bar",
    items: "titled",
    signature: { align: "center", width: px(300) },
    footer: { rule: false, oneLine: "none" },
    paper: "light",
    ink: "#2E3A31",
    muted: "#6E7F71",
    size: { body: px(14), name: px(34), title: px(12), small: px(11) },
  },
  modern: {
    id: "modern",
    padding: [px(52), px(56), px(64), px(48)],
    gap: px(24),
    header: "sidebar",
    sidebar: px(150),
    title: "ruled",
    items: "numbered",
    signature: { align: "right", width: px(280) },
    footer: { rule: false, oneLine: "plain" },
    paper: "white",
    ink: "#1F2A24",
    muted: "#5C6B60",
    size: { body: px(14), name: px(30), title: px(13), small: px(11) },
  },
  minimal: {
    id: "minimal",
    padding: [px(88), px(96), px(56), px(96)],
    gap: px(36),
    header: "nameOnly",
    sidebar: 0,
    title: "plain",
    items: "plain",
    signature: { align: "right", width: px(240) },
    footer: { rule: false, oneLine: "caps" },
    paper: "white",
    ink: "#2A2E2B",
    muted: "#6B726D",
    size: { body: px(14), name: px(22), title: px(14), small: px(10) },
  },
};

// The preset for a stored layout id; an id this client doesn't know draws
// Classic (02).
export function presetFor(layoutId: string): LayoutPreset {
  return LAYOUT_PRESETS[layoutFor(layoutId)];
}

// The bottom band's height, points (the mock-ups: 22 px flat / two-tone; the
// angled one rises 32 px). The footer always ends above it (Vitor 10-13).
export function bandHeight(style: "none" | "flat" | "twoTone" | "rounded" | "angled"): number {
  if (style === "none") return 0;
  return style === "angled" ? px(32) : px(22);
}
