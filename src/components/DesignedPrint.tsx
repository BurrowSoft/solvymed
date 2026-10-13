"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BrowserDesignInput } from "@/lib/pdf/browser";

// A print page in the practice's saved design (Document Studio PR4; 02,
// 10-12: web Print = the designed PDF): the PDF is made on the device, its
// pages shown, and "Imprimir / Salvar PDF" prints that PDF (phones open it
// to print or save). Without a saved design the page keeps today's HTML
// print view.
export function DesignedPrint({ input, fileName, backHref, backLabel }: { input: BrowserDesignInput; fileName: string; backHref: string; backLabel?: string }) {
  const t = useTranslations("prescriptionDoc");
  const tDocs = useTranslations("documents");
  const box = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [state, setState] = useState<"rendering" | "ready" | "failed">("rendering");
  const key = JSON.stringify(input);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { renderInBrowser, drawPages } = await import("@/lib/pdf/browser");
        const pdf = await renderInBrowser(input);
        const canvases = await drawPages(pdf, box.current?.clientWidth || 680);
        if (!alive || !pages.current) return;
        pages.current.replaceChildren(...canvases.map((cv) => {
          cv.className = "block w-full bg-white shadow-sm ring-1 ring-slate-100";
          cv.setAttribute("role", "img");
          return cv;
        }));
        setBytes(pdf);
        setState("ready");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => { alive = false; };
    // `key` stands for the whole input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function print() {
    if (!bytes) return;
    const { printPdf } = await import("@/lib/pdf/browser");
    printPdf(bytes, fileName);
  }

  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto mb-6 flex max-w-[680px] flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-semibold text-slate-500 hover:text-slate-700">← {backLabel ?? t("back")}</Link>
        <div className="flex flex-col items-end gap-1">
          <button type="button" data-testid="designed-print" onClick={() => void print()} disabled={state !== "ready"}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
            {t("print")}
          </button>
          <p className="text-xs text-slate-500">{t("printHint")}</p>
        </div>
      </div>
      <div ref={box} data-testid="designed-pages" data-state={state} className="mx-auto max-w-[680px]">
        {state === "failed" && <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">{tDocs("pdfFailed")}</p>}
        {state === "rendering" && <div className="aspect-[595/842] w-full animate-pulse rounded-sm bg-white shadow-sm ring-1 ring-slate-100" />}
        <div ref={pages} className="space-y-4" />
      </div>
    </div>
  );
}
