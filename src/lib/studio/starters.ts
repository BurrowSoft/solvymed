import type { Design, DocType, KnownLayout } from "./design";

// Document Studio editor (PR3): picking a layout applies its look from the
// approved mock-ups (specs/studio-layouts: the section bars, fields, band,
// typeface and watermark each layout was shown with); the doctor's palette,
// logo, name, footer, contacts and texts stay as they are. A starting point
// only: every part can be changed afterwards. Mirrored by the app's editor.
type Starter = Pick<Design, "font" | "sectionBar" | "field" | "band" | "watermark">;

export const LAYOUT_STARTERS: Record<KnownLayout, Starter> = {
  classic: {
    font: "sarabun",
    sectionBar: { fill: "none", text: "ink", upper: true, spaced: true },
    field: { style: "plain", line: "muted" },
    band: { style: "none", colors: [] },
    watermark: { on: false, logo: "square", size: "m", opacity: 0.06 },
  },
  elegant: {
    font: "trirong",
    sectionBar: { fill: "primary", text: "white", upper: true, spaced: true },
    field: { style: "underline", line: "accent" },
    band: { style: "twoTone", colors: ["primary", "accent"] },
    watermark: { on: true, logo: "square", size: "l", opacity: 0.06 },
  },
  modern: {
    font: "prompt",
    sectionBar: { fill: "none", text: "primary", upper: true, spaced: true },
    field: { style: "box", line: "light" },
    band: { style: "angled", colors: ["accent"] },
    watermark: { on: false, logo: "square", size: "m", opacity: 0.06 },
  },
  minimal: {
    font: "sarabun",
    sectionBar: { fill: "none", text: "ink", upper: false, spaced: false },
    field: { style: "plain", line: "muted" },
    band: { style: "none", colors: [] },
    watermark: { on: false, logo: "square", size: "m", opacity: 0.06 },
  },
};

export function withLayout(d: Design, layout: KnownLayout): Design {
  const s = LAYOUT_STARTERS[layout];
  return { ...d, layout, font: s.font, sectionBar: { ...s.sectionBar }, field: { ...s.field }, band: { ...s.band, colors: [...s.band.colors] }, watermark: { ...s.watermark } };
}

// The band's colours follow its style: two for two-tone, one otherwise
// (the current first one, else the main colour), none for no band.
export function withBand(d: Design, style: Design["band"]["style"]): Design {
  const first = d.band.colors[0] ?? "primary";
  const colors: Design["band"]["colors"] = style === "none" ? [] : style === "twoTone" ? [first, first === "accent" ? "primary" : "accent"] : [first];
  return { ...d, band: { style, colors } };
}

// Section bars: a filled bar takes white text; no bar keeps the text colour
// it had unless that was white (unreadable on paper), then ink.
export function withSectionFill(d: Design, fill: Design["sectionBar"]["fill"]): Design {
  const text = fill === "none" ? (d.sectionBar.text === "white" ? "ink" : d.sectionBar.text) : "white";
  return { ...d, sectionBar: { ...d.sectionBar, fill, text } };
}

// What the editor saves: "system" (today's look, an unsaved design) becomes
// Sarabun, the font it already renders in (a saved design names a curated one).
export function forEditing(d: Design): Design {
  return d.font === "system" ? { ...d, font: "sarabun" } : d;
}

// What is saved: contacts without a value dropped, empty texts as null (and
// a type with neither text left out).
export function cleanDesign(d: Design): Design {
  const texts: Design["texts"] = {};
  for (const [k, v] of Object.entries(d.texts) as [DocType, { header: string | null; footer: string | null }][]) {
    const header = v?.header?.trim() ? v.header : null;
    const footer = v?.footer?.trim() ? v.footer : null;
    if (header || footer) texts[k] = { header, footer };
  }
  return {
    ...d,
    footer: { ...d.footer, contacts: d.footer.contacts.map((c) => ({ kind: c.kind, value: c.value.trim() })).filter((c) => c.value) },
    texts,
  };
}
