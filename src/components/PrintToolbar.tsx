"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// Above a printed document (prescription, history, recibo), never printed itself: "Imprimir / Salvar
// PDF" opens the browser's print window, where "Salvar como PDF" gives the
// file.
// backLabel: where "back" goes when it isn't the patient (the recibo → Payments).
// printable: false = a page with nothing to print (e.g. the Thai receipt
// note): only the way back (3e).
export function PrintToolbar({ backHref, backLabel, printable = true }: { backHref: string; backLabel?: string; printable?: boolean }) {
  const t = useTranslations("prescriptionDoc");
  return (
    <div className="print-hide mx-auto mb-6 flex max-w-[680px] flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="text-sm font-semibold text-slate-500 hover:text-slate-700">← {backLabel ?? t("back")}</Link>
      {printable && <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={() => window.print()} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
          {t("print")}
        </button>
        <p className="text-xs text-slate-500">{t("printHint")}</p>
      </div>}
    </div>
  );
}
