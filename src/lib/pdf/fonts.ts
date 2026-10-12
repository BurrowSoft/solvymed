import type { FontBytes } from "./document";
import type { FontId } from "@/lib/studio/design";

// The PDFs' typefaces (Document Studio, 1.9.0): a small curated set, every
// one a single Latin + Thai family under the SIL Open Font License, so a
// design never needs a per-script fallback and the app embeds the same
// files. Sarabun is today's (the website's shared PDFs); "system" (an
// unsaved design) also renders in Sarabun here, since a PDF must embed a
// font (02 (A): the one cosmetic change, noted in the release notes).
export const FONT_FILES: Record<Exclude<FontId, "system">, { dir: string; regular: string; bold: string }> = {
  sarabun: { dir: "sarabun", regular: "Sarabun-Regular.ttf", bold: "Sarabun-Bold.ttf" },
  trirong: { dir: "trirong", regular: "Trirong-Regular.ttf", bold: "Trirong-Bold.ttf" },
  prompt: { dir: "prompt", regular: "Prompt-Regular.ttf", bold: "Prompt-Bold.ttf" },
};

export function fontFilesFor(id: FontId) {
  return FONT_FILES[id === "system" ? "sarabun" : id];
}

// The bytes, from /fonts/<family> in the browser; `read` lets tests (and a
// server render) read them from disk instead.
export async function loadDesignFontBytes(id: FontId, read: (path: string) => Promise<Uint8Array> = fetchBytes): Promise<FontBytes> {
  const f = fontFilesFor(id);
  const [regular, bold] = await Promise.all([read(`/fonts/${f.dir}/${f.regular}`), read(`/fonts/${f.dir}/${f.bold}`)]);
  return { regular, bold };
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(path)).arrayBuffer());
}

// pdf-lib's subsetter drops most of Trirong's and Prompt Bold's glyphs (the
// PDF shows gaps; Sarabun subsets fine, as the 1.8.0 PDFs do). Those two are
// embedded whole (~0.2 MB a file) until the subsetter is fixed or replaced;
// the font goldens (studio-fonts.test) prove each setting.
export const SUBSET_SAFE: Record<Exclude<FontId, "system">, boolean> = { sarabun: true, trirong: false, prompt: false };

type Embedder = { embedFont(bytes: Uint8Array, opts: { subset: boolean }): Promise<import("pdf-lib").PDFFont> };
export async function embedDesignFonts(pdf: Embedder, id: FontId, bytes: FontBytes) {
  const subset = SUBSET_SAFE[id === "system" ? "sarabun" : id];
  return { regular: await pdf.embedFont(bytes.regular, { subset }), bold: await pdf.embedFont(bytes.bold, { subset }) };
}
