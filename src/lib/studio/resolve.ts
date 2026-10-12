import type { Design, DocType, FontId } from "./design";

// What a document is drawn with (Document Studio PR2, the plumbing behind
// the layouts): the typeface, the colours and the header/footer texts,
// from the practice's saved design, or exactly today's values when there
// is none or it isn't saved yet (the brand.saved rule: documents don't
// change unasked; c5's migration copies the old template texts into an
// unsaved design).

// Today's inputs (document_templates / My brand, as the renderers take them).
export type LegacyStyle = {
  primaryColor: string;
  accentColor: string;
  headerText: string | null;
  footerText: string | null;
  // My brand's colour, when the brand is saved: today it wins over the template's.
  brandColor: string | null;
};

export type DocStyle = {
  fontId: FontId;
  // The title, rules and table header colour.
  primaryColor: string;
  // The light tint (table rows, the notes box).
  accentColor: string;
  headerText: string | null;
  footerText: string | null;
  // The colour the brand block uses: the design's primary once a design is
  // saved (the renderers prefer a brand colour over the template's).
  brandColor: string | null;
};

export function resolveStyle(design: Design | null, saved: boolean, legacy: LegacyStyle, type: DocType): DocStyle {
  if (!design || !saved) {
    return { fontId: "sarabun", primaryColor: legacy.primaryColor, accentColor: legacy.accentColor, headerText: legacy.headerText, footerText: legacy.footerText, brandColor: legacy.brandColor };
  }
  const texts = design.texts[type];
  return {
    // A saved design always names a curated font; "system" renders in Sarabun.
    fontId: design.font === "system" ? "sarabun" : design.font,
    primaryColor: design.palette.primary,
    accentColor: design.palette.light,
    headerText: texts?.header ?? null,
    footerText: texts?.footer ?? null,
    brandColor: design.palette.primary,
  };
}
