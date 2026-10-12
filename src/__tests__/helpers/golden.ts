import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// Golden images for the PDF renderers (Document Studio, 1.9.0): a page is
// rasterised with pdf.js (the same engine the poster PNG export uses in the
// browser) onto @napi-rs/canvas, and compared pixel by pixel with the PNG
// kept in src/__tests__/__goldens__. A missing golden is written (review it
// before committing); UPDATE_GOLDENS=1 rewrites them on purpose. Run these
// tests in the node environment (// @vitest-environment node).

export const GOLDEN_DIR = join(process.cwd(), "src", "__tests__", "__goldens__");

// One page of a PDF as a PNG, `scale` pixels per point (1.5 ≈ 108 dpi).
export async function renderPdfPage(bytes: Uint8Array, pageIndex = 0, scale = 1.5): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    // pdf.js's own canvas (its bundled @napi-rs/canvas): a canvas from another
    // copy of the library fails its Path2D checks.
    const factory = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { width: number; height: number; toBuffer(type: string): Buffer }; context: CanvasRenderingContext2D } } }).canvasFactory;
    const { canvas, context: ctx } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await doc.destroy();
  }
}

// Compares with the golden `name`.png; returns the share of pixels that differ.
export function compareGolden(name: string, png: Buffer, opts: { threshold?: number } = {}): { written: boolean; diffRatio: number } {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const file = join(GOLDEN_DIR, `${name}.png`);
  if (process.env.UPDATE_GOLDENS === "1" || !existsSync(file)) {
    writeFileSync(file, png);
    return { written: true, diffRatio: 0 };
  }
  const a = PNG.sync.read(readFileSync(file));
  const b = PNG.sync.read(png);
  if (a.width !== b.width || a.height !== b.height) return { written: false, diffRatio: 1 };
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: opts.threshold ?? 0.1 });
  return { written: false, diffRatio: diff / (a.width * a.height) };
}

// The share of pixels allowed to differ: anti-aliasing varies a little
// between machines (the goldens are made on Windows, CI runs Linux); a
// missing or misplaced glyph changes far more (Trirong's broken subset
// left most of the sample blank).
export const GOLDEN_TOLERANCE = 0.01;
