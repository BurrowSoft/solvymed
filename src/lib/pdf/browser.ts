import type { DesignedInput } from "@/lib/pdf/designed";
import type { FontId } from "@/lib/studio/design";

// Document Studio in the browser: the designed PDF made on the device (the
// same renderer as the shared copies), and its pages drawn by pdf.js onto
// canvases, so every browser shows it the same way (Android's Chrome shows
// no PDF inside a page). The PDF libraries load here, on demand, never with
// the page.

export type BrowserDesignInput = Omit<DesignedInput, "logos"> & {
  logoUrls: { square: string | null; wide: string | null; reversed: string | null };
  // Demo mode: the footer line of the DEMO stamp (lib/pdf/demoStamp); absent
  // for real accounts.
  demoFooter?: string | null;
};

const bytesCache = new Map<string, Promise<Uint8Array | null>>();
export function bytesOf(url: string | null): Promise<Uint8Array | null> {
  if (!url) return Promise.resolve(null);
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null)).catch(() => null);
    bytesCache.set(url, p);
  }
  return p;
}

const fontCache = new Map<FontId, Promise<{ regular: Uint8Array; bold: Uint8Array }>>();

export async function renderInBrowser(input: BrowserDesignInput): Promise<Uint8Array> {
  const [{ renderDesignedDocument }, { loadDesignFontBytes }] = await Promise.all([import("@/lib/pdf/designed"), import("@/lib/pdf/fonts")]);
  let fonts = fontCache.get(input.design.font);
  if (!fonts) {
    fonts = loadDesignFontBytes(input.design.font);
    fontCache.set(input.design.font, fonts);
    fonts.catch(() => fontCache.delete(input.design.font));
  }
  const [f, square, wide, reversed] = await Promise.all([fonts, bytesOf(input.logoUrls.square), bytesOf(input.logoUrls.wide), bytesOf(input.logoUrls.reversed)]);
  const { design, locale, practice, doc } = input;
  const pdf = await renderDesignedDocument({ design, locale, practice, doc, logos: { square, wide, reversed } }, f);
  if (!input.demoFooter) return pdf;
  const { stampDemo } = await import("@/lib/pdf/demoStamp");
  return stampDemo(pdf, input.demoFooter, f.regular);
}

// Each page as a canvas `cssWidth` CSS pixels wide (drawn off-screen first,
// so a visible canvas never shows a half-drawn page).
export async function drawPages(bytes: Uint8Array, cssWidth: number, max = Infinity): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  // pdf.js takes ownership of the buffer it's given: hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const out: HTMLCanvasElement[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(canvas);
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

// Print the PDF: the browser's print window on the PDF itself (a hidden
// frame); where a page can't hold a PDF (phones), the PDF opens on its own,
// to print or save from the viewer.
export function printPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const later = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = fileName;
    a.click();
    later();
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => frame.remove(), 60_000);
    later();
  };
  frame.src = url;
  document.body.appendChild(frame);
}

// Posters (PR5): the same fonts and logos, the poster renderer.
export async function fontsFor(id: FontId): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  const { loadDesignFontBytes } = await import("@/lib/pdf/fonts");
  let fonts = fontCache.get(id);
  if (!fonts) {
    fonts = loadDesignFontBytes(id);
    fontCache.set(id, fonts);
    fonts.catch(() => fontCache.delete(id));
  }
  return fonts;
}

// The first page as a PNG exactly `widthPx` wide (the Instagram sizes:
// 1080 px, whatever the screen's density).
export async function pngOf(bytes: Uint8Array, widthPx: number): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: widthPx / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
  } finally {
    await doc.destroy();
  }
}

// Save a file made on the device (nothing is uploaded).
export function downloadFile(data: Uint8Array | Blob, fileName: string, type = "application/pdf"): void {
  const blob = data instanceof Blob ? data : new Blob([data.slice()], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
