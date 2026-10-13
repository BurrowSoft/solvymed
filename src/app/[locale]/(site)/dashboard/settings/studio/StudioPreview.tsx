"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignedInput } from "@/lib/pdf/designed";
import type { FontId } from "@/lib/studio/design";
import type { prescriptionContent } from "@/lib/studio/content";

// Document Studio's live preview: the real PDF (the same renderer documents
// use) drawn by pdf.js onto a canvas, so every browser shows it the same way
// (Android's Chrome shows no PDF inside a page). Re-rendered a moment after
// the last change; a render that a newer one overtook is dropped. The PDF
// libraries load only here, on demand, not with the page.

export type PreviewInput = Omit<DesignedInput, "logos" | "doc"> & {
  logoUrls: { square: string | null; wide: string | null; reversed: string | null };
  rx: Parameters<typeof prescriptionContent>[0];
  headerText: string | null;
  footerText: string | null;
};
type Input = PreviewInput;

const bytesCache = new Map<string, Promise<Uint8Array | null>>();
function bytesOf(url: string | null): Promise<Uint8Array | null> {
  if (!url) return Promise.resolve(null);
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null)).catch(() => null);
    bytesCache.set(url, p);
  }
  return p;
}

const fontCache = new Map<FontId, Promise<{ regular: Uint8Array; bold: Uint8Array }>>();

async function renderPdf(input: Input): Promise<Uint8Array> {
  const [{ renderDesignedDocument }, { loadDesignFontBytes }, { prescriptionContent }] = await Promise.all([import("@/lib/pdf/designed"), import("@/lib/pdf/fonts"), import("@/lib/studio/content")]);
  let fonts = fontCache.get(input.design.font);
  if (!fonts) {
    fonts = loadDesignFontBytes(input.design.font);
    fontCache.set(input.design.font, fonts);
    fonts.catch(() => fontCache.delete(input.design.font));
  }
  const [f, square, wide, reversed] = await Promise.all([fonts, bytesOf(input.logoUrls.square), bytesOf(input.logoUrls.wide), bytesOf(input.logoUrls.reversed)]);
  const { design, locale, practice, rx, headerText, footerText } = input;
  return renderDesignedDocument({ design, locale, practice, logos: { square, wide, reversed }, doc: { ...prescriptionContent(rx), headerText, footerText } }, f);
}

async function drawPdf(bytes: Uint8Array, canvas: HTMLCanvasElement, cssWidth: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    // Drawn off-screen, then copied: the visible canvas never shows a half-drawn page.
    const off = document.createElement("canvas");
    off.width = Math.ceil(viewport.width);
    off.height = Math.ceil(viewport.height);
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, off.width, off.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext("2d")?.drawImage(off, 0, 0);
  } finally {
    await doc.destroy();
  }
}

export function StudioPreview({ input, label, failedLabel }: { input: Input; label: string; failedLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const [state, setState] = useState<"rendering" | "ready" | "failed">("rendering");
  const key = JSON.stringify(input);

  useEffect(() => {
    const id = ++run.current;
    setState("rendering");
    const timer = window.setTimeout(async () => {
      try {
        const bytes = await renderPdf(input);
        if (id !== run.current || !canvas.current) return;
        await drawPdf(bytes, canvas.current, box.current?.clientWidth || 400);
        if (id === run.current) setState("ready");
      } catch {
        if (id === run.current) setState("failed");
      }
    }, 300);
    return () => window.clearTimeout(timer);
    // `key` stands for the whole input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div ref={box} data-testid="studio-preview" data-state={state} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" style={{ aspectRatio: "595 / 842" }}>
      <canvas ref={canvas} aria-label={label} role="img" className={`h-full w-full transition-opacity ${state === "rendering" ? "opacity-70" : ""}`} />
      {state === "failed" && <p role="alert" className="absolute inset-x-0 top-1/2 px-4 text-center text-sm text-red-600">{failedLabel}</p>}
    </div>
  );
}
