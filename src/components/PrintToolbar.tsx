"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDemo } from "@/components/DemoGate";

// Above a printed document (prescription, history, recibo), never printed itself: "Imprimir / Salvar
// PDF" opens the browser's print window, where "Salvar como PDF" gives the
// file.
// backLabel: where "back" goes when it isn't the patient (the recibo → Payments).
// printable: false = a page with nothing to print (e.g. the Thai receipt
// note): only the way back (3e).
export function PrintToolbar({ backHref, backLabel, printable = true }: { backHref: string; backLabel?: string; printable?: boolean }) {
  const t = useTranslations("prescriptionDoc");
  const { demo } = useDemo();
  return (
    <>
      <div className="print-hide mx-auto mb-6 flex max-w-[680px] flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-semibold text-slate-500 hover:text-slate-700">← {backLabel ?? t("back")}</Link>
        {printable && <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
            {t("print")}
          </button>
          <p className="text-xs text-slate-500">{t("printHint")}</p>
        </div>}
      </div>
      {demo && printable && <DemoPrintMark />}
    </>
  );
}

// Demo mode (01, 10-22: every document a demo can produce says DEMO, error
// paths included): the HTML print views (no saved design, or the designed
// PDF failed) get the same diagonal DEMO + footer line as the PDFs. Fixed,
// so the browser repeats it on every printed page.
function DemoPrintMark() {
  const t = useTranslations("demo");
  return (
    <div data-testid="demo-print-mark" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55] [print-color-adjust:exact]">
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] select-none text-[min(28vw,240px)] font-black leading-none text-[#F59E0B] opacity-[0.18]">DEMO</span>
      <span className="absolute inset-x-0 bottom-2 text-center text-[11px] text-[#8A6A1B]">{t("pdfFooter")}</span>
    </div>
  );
}
