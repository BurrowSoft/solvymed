"use client";

import { useTranslations } from "next-intl";
import type { Band } from "@/lib/patientChannel/score";

export function BandTag({ band }: { band: Band }) {
  const t = useTranslations("patientChannel");
  const cls = band === "red" ? "bg-red-50 text-red-700" : band === "amber" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{t(`bands.${band}`)}</span>;
}
