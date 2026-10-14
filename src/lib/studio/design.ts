// Document Studio (1.9.0, specs/document-studio.md): a practice's "design",
// one JSON per practice, rendered by each engine (the app's HTML, the
// website's PDFs). The shape is the contract agreed with the app (c5) and
// checked again by the server (document_designs, _validate_design_v1):
// unknown keys are refused, every value is one of a fixed set or a short
// string, and the whole design is at most 32 KB. Presets + bounded slots,
// not a free canvas.
//
// Colours inside the slots are references to the palette ("primary",
// "accent", "light"), never raw hex, so a palette preset recolours
// everything. Names, title, specialty and registration stay in My brand
// (one source); the design only styles them.

export const DESIGN_VERSION = 1;
export const DESIGN_MAX_BYTES = 32 * 1024;

// The layouts THIS client knows (its presets: the picker offers these, the
// renderers draw these). Layouts are data and more get added (Vitor 10-14):
// a design stores the layout's id, any well-formed one is valid (LAYOUT_ID),
// so a design saved with a newer layout passes everywhere; a client that
// doesn't know it draws Classic (layoutFor) and keeps the id when saving
// other changes (02: only the doctor's own pick changes it).
export const LAYOUTS = ["classic", "elegant", "modern", "minimal"] as const;
export const LAYOUT_ID = /^[a-z][a-z0-9-]{1,31}$/;
// "system": only an unsaved / migrated design (today's look, 02 (A)): saving
// a design picks one of the curated fonts.
export const FONTS = ["system", "sarabun", "trirong", "prompt"] as const;
export const CURATED_FONTS = ["sarabun", "trirong", "prompt"] as const;
export const PALETTE_REFS = ["primary", "accent", "light"] as const;
export const CONTACT_KINDS = ["phone", "whatsapp", "line", "instagram", "site", "email"] as const;
export const DOC_TYPES = ["prescription", "certificate", "declaration", "exam_request", "th_certificate", "receipt", "history", "letterhead"] as const;
// Legal layouts, never themed (c5): the BR controlled prescription (Anvisa)
// and the Thai receipt (lawyer-reviewed) take brand hooks only.
export const NON_DESIGNABLE = ["controlled_prescription", "thai_receipt"] as const;

export type KnownLayout = (typeof LAYOUTS)[number];
// A stored layout id: a known one, or one a newer client added.
export type Layout = string;

// The layout to draw: the stored one when this client knows it, else Classic.
export function layoutFor(id: string): KnownLayout {
  return (LAYOUTS as readonly string[]).includes(id) ? (id as KnownLayout) : "classic";
}
export type FontId = (typeof FONTS)[number];
export type PaletteRef = (typeof PALETTE_REFS)[number];
export type ContactKind = (typeof CONTACT_KINDS)[number];
export type DocType = (typeof DOC_TYPES)[number];

export type Design = {
  v: 1;
  layout: Layout;
  palette: { primary: string; accent: string; light: string; preset: string | null };
  font: FontId;
  nameBlock: { style: "regular" | "spaced" | "large" };
  logoUse: { header: "wide" | "square" | "reversed" | "none" };
  watermark: { on: boolean; logo: "square" | "wide"; size: "s" | "m" | "l"; opacity: number };
  sectionBar: { fill: PaletteRef | "none"; text: "white" | "primary" | "ink"; upper: boolean; spaced: boolean };
  field: { style: "underline" | "box" | "plain"; line: PaletteRef | "muted" };
  footer: { columns: 1 | 2 | 3; locations: boolean; contacts: { kind: ContactKind; value: string }[] };
  band: { style: "none" | "flat" | "twoTone" | "rounded" | "angled"; colors: PaletteRef[] };
  signature: { stamp: true; image: boolean; imagePath: string | null };
  texts: Partial<Record<DocType, { header: string | null; footer: string | null }>>;
};

// Curated palettes (Vivian's sage & sand among them; names are ids, the UI
// labels them).
export const PALETTE_PRESETS: Record<string, { primary: string; accent: string; light: string }> = {
  solvymed: { primary: "#208AEF", accent: "#116E99", light: "#E8F4FE" },
  sageSand: { primary: "#7B917E", accent: "#BAA689", light: "#F5F5F0" },
  forestCream: { primary: "#2F5D46", accent: "#B08D57", light: "#F7F3EA" },
  navyGold: { primary: "#1F2A44", accent: "#C9A227", light: "#F4F1E8" },
};

// Today's look: what a practice that never saved a design prints, and
// exactly what Classic + "system" must reproduce (the brand.saved rule:
// documents don't change unasked). The colours are today's template
// defaults (lib/prescriptionDoc DEFAULT_TEMPLATE).
export const DEFAULT_DESIGN: Design = {
  v: 1,
  layout: "classic",
  palette: { primary: "#208AEF", accent: "#208AEF", light: "#E8F4FE", preset: null },
  font: "system",
  nameBlock: { style: "regular" },
  logoUse: { header: "wide" },
  watermark: { on: false, logo: "square", size: "m", opacity: 0.06 },
  sectionBar: { fill: "none", text: "ink", upper: false, spaced: false },
  field: { style: "plain", line: "muted" },
  footer: { columns: 1, locations: true, contacts: [] },
  band: { style: "none", colors: [] },
  signature: { stamp: true, image: false, imagePath: null },
  texts: {},
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TEXT_MAX = 300;
const CONTACT_MAX = 120;
const CONTACTS_MAX = 6;

type Check = { ok: true; design: Design } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function onlyKeys(o: Record<string, unknown>, keys: readonly string[], at: string): string | null {
  for (const k of Object.keys(o)) if (!keys.includes(k)) return `${at}.${k}: unknown key`;
  for (const k of keys) if (!(k in o)) return `${at}.${k}: missing`;
  return null;
}
const oneOf = <T extends string>(v: unknown, set: readonly T[]): v is T => typeof v === "string" && (set as readonly string[]).includes(v);

// The same checks as the server's _validate_design_v1 (so the editor can
// say what's wrong before saving; the server stays the authority).
export function validateDesign(input: unknown): Check {
  if (!isObj(input)) return { ok: false, error: "design: not an object" };
  // UTF-8 bytes, as the server counts (Thai is 3 bytes a character).
  if (new TextEncoder().encode(JSON.stringify(input)).length > DESIGN_MAX_BYTES) return { ok: false, error: "design: too large" };
  const top = ["v", "layout", "palette", "font", "nameBlock", "logoUse", "watermark", "sectionBar", "field", "footer", "band", "signature", "texts"];
  const e0 = onlyKeys(input, top, "design"); if (e0) return { ok: false, error: e0 };
  const d = input as Record<string, unknown>;
  if (d.v !== DESIGN_VERSION) return { ok: false, error: "design.v" };
  if (typeof d.layout !== "string" || !LAYOUT_ID.test(d.layout)) return { ok: false, error: "design.layout" };
  if (!oneOf(d.font, FONTS)) return { ok: false, error: "design.font" };

  const p = d.palette; if (!isObj(p)) return { ok: false, error: "palette" };
  const ep = onlyKeys(p, ["primary", "accent", "light", "preset"], "palette"); if (ep) return { ok: false, error: ep };
  for (const k of ["primary", "accent", "light"]) if (typeof p[k] !== "string" || !HEX.test(p[k] as string)) return { ok: false, error: `palette.${k}` };
  if (p.preset !== null && !(typeof p.preset === "string" && Object.hasOwn(PALETTE_PRESETS, p.preset))) return { ok: false, error: "palette.preset" };

  const nb = d.nameBlock; if (!isObj(nb)) return { ok: false, error: "nameBlock" };
  const enb = onlyKeys(nb, ["style"], "nameBlock"); if (enb) return { ok: false, error: enb };
  if (!oneOf(nb.style, ["regular", "spaced", "large"] as const)) return { ok: false, error: "nameBlock.style" };

  const lu = d.logoUse; if (!isObj(lu)) return { ok: false, error: "logoUse" };
  const elu = onlyKeys(lu, ["header"], "logoUse"); if (elu) return { ok: false, error: elu };
  if (!oneOf(lu.header, ["wide", "square", "reversed", "none"] as const)) return { ok: false, error: "logoUse.header" };

  const w = d.watermark; if (!isObj(w)) return { ok: false, error: "watermark" };
  const ew = onlyKeys(w, ["on", "logo", "size", "opacity"], "watermark"); if (ew) return { ok: false, error: ew };
  if (typeof w.on !== "boolean" || !oneOf(w.logo, ["square", "wide"] as const) || !oneOf(w.size, ["s", "m", "l"] as const)) return { ok: false, error: "watermark" };
  if (typeof w.opacity !== "number" || !(w.opacity >= 0.03 && w.opacity <= 0.15)) return { ok: false, error: "watermark.opacity" };

  const sb = d.sectionBar; if (!isObj(sb)) return { ok: false, error: "sectionBar" };
  const esb = onlyKeys(sb, ["fill", "text", "upper", "spaced"], "sectionBar"); if (esb) return { ok: false, error: esb };
  if (!oneOf(sb.fill, [...PALETTE_REFS, "none"] as const) || !oneOf(sb.text, ["white", "primary", "ink"] as const) || typeof sb.upper !== "boolean" || typeof sb.spaced !== "boolean") return { ok: false, error: "sectionBar" };

  const fd = d.field; if (!isObj(fd)) return { ok: false, error: "field" };
  const efd = onlyKeys(fd, ["style", "line"], "field"); if (efd) return { ok: false, error: efd };
  if (!oneOf(fd.style, ["underline", "box", "plain"] as const) || !oneOf(fd.line, [...PALETTE_REFS, "muted"] as const)) return { ok: false, error: "field" };

  const ft = d.footer; if (!isObj(ft)) return { ok: false, error: "footer" };
  const eft = onlyKeys(ft, ["columns", "locations", "contacts"], "footer"); if (eft) return { ok: false, error: eft };
  if (![1, 2, 3].includes(ft.columns as number) || typeof ft.locations !== "boolean" || !Array.isArray(ft.contacts) || ft.contacts.length > CONTACTS_MAX) return { ok: false, error: "footer" };
  for (const c of ft.contacts) {
    if (!isObj(c) || onlyKeys(c, ["kind", "value"], "contact") || !oneOf(c.kind, CONTACT_KINDS) || typeof c.value !== "string" || !c.value.trim() || c.value.length > CONTACT_MAX) return { ok: false, error: "footer.contacts" };
  }

  const b = d.band; if (!isObj(b)) return { ok: false, error: "band" };
  const eb = onlyKeys(b, ["style", "colors"], "band"); if (eb) return { ok: false, error: eb };
  if (!oneOf(b.style, ["none", "flat", "twoTone", "rounded", "angled"] as const) || !Array.isArray(b.colors) || b.colors.length > 2 || !b.colors.every((x) => oneOf(x, PALETTE_REFS))) return { ok: false, error: "band" };

  const s = d.signature; if (!isObj(s)) return { ok: false, error: "signature" };
  const es = onlyKeys(s, ["stamp", "image", "imagePath"], "signature"); if (es) return { ok: false, error: es };
  // The typed stamp (legal details) is always on.
  if (s.stamp !== true || typeof s.image !== "boolean" || !(s.imagePath === null || (typeof s.imagePath === "string" && s.imagePath.length <= 200))) return { ok: false, error: "signature" };
  if (s.image && !s.imagePath) return { ok: false, error: "signature.imagePath" };

  const t = d.texts; if (!isObj(t)) return { ok: false, error: "texts" };
  for (const [k, v] of Object.entries(t)) {
    if (!oneOf(k, DOC_TYPES)) return { ok: false, error: `texts.${k}: unknown key` };
    if (!isObj(v) || onlyKeys(v, ["header", "footer"], `texts.${k}`)) return { ok: false, error: `texts.${k}` };
    for (const part of ["header", "footer"] as const) {
      const x = v[part];
      if (!(x === null || (typeof x === "string" && x.length <= TEXT_MAX))) return { ok: false, error: `texts.${k}.${part}` };
    }
  }
  return { ok: true, design: input as Design };
}

// A palette reference → its hex.
export function paletteColor(d: Pick<Design, "palette">, ref: PaletteRef): string {
  return d.palette[ref];
}

// What the editor does per practice country (country config, never if-BR;
// a new country = one entry here). Every contact kind is offered
// everywhere; only the kind a new contact starts with follows the country
// (02, 10-13). legalNote: the strings key naming the country's legal layout
// (strings.json legalNote.<key>); null = no note.
// Posters (02, 10-13; ad rules, on the lawyer list): posterSpecialty =
// whether a poster may name the specialty (Brazil: only with an RQE, which
// the profile doesn't hold yet, so no); posterPrice = whether a service
// poster may show a price (Brazil: no). The name and registration line are
// always printed.
export type StudioCountry = { contact: ContactKind; legalNote: "BR" | "TH" | null; posterSpecialty: boolean; posterPrice: boolean };
const STUDIO_COUNTRIES: Readonly<Record<string, StudioCountry>> = {
  BR: { contact: "whatsapp", legalNote: "BR", posterSpecialty: false, posterPrice: false },
  TH: { contact: "line", legalNote: "TH", posterSpecialty: true, posterPrice: true },
};
// The explicit default: any other country (or an unknown one); the
// cautious choice on posters.
const STUDIO_COUNTRY_DEFAULT: StudioCountry = { contact: "phone", legalNote: null, posterSpecialty: false, posterPrice: false };

export function studioCountry(country: string | null | undefined): StudioCountry {
  return STUDIO_COUNTRIES[(country ?? "").toUpperCase()] ?? STUDIO_COUNTRY_DEFAULT;
}
export function defaultContactKind(country: string | null | undefined): ContactKind {
  return studioCountry(country).contact;
}
