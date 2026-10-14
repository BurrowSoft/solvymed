"use client";

import { useEffect, useRef, useState } from "react";
import type { prescriptionContent } from "@/lib/studio/content";
import type { BrowserDesignInput } from "@/lib/pdf/browser";

// Document Studio's live preview: the real PDF (the same renderer documents
// use) drawn onto a canvas (lib/pdf/browser). Re-rendered a moment after the
// last change; a render that a newer one overtook is dropped. The PDF
// libraries load only here, on demand, not with the page.

export type PreviewInput = Omit<BrowserDesignInput, "doc"> & {
  rx: Parameters<typeof prescriptionContent>[0];
  headerText: string | null;
  footerText: string | null;
};

async function renderPreview(input: PreviewInput): Promise<Uint8Array> {
  const [{ renderInBrowser }, { prescriptionContent }] = await Promise.all([import("@/lib/pdf/browser"), import("@/lib/studio/content")]);
  const { rx, headerText, footerText, ...rest } = input;
  return renderInBrowser({ ...rest, doc: { ...prescriptionContent(rx), headerText, footerText } });
}

export function StudioPreview({ input, label, failedLabel }: { input: PreviewInput; label: string; failedLabel: string }) {
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
        const bytes = await renderPreview(input);
        if (id !== run.current || !canvas.current) return;
        const { drawPages } = await import("@/lib/pdf/browser");
        const [page] = await drawPages(bytes, box.current?.clientWidth || 400, 1);
        if (id !== run.current || !canvas.current || !page) return;
        canvas.current.width = page.width;
        canvas.current.height = page.height;
        canvas.current.getContext("2d")?.drawImage(page, 0, 0);
        setState("ready");
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
