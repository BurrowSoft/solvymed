"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// After a merge the kept record opens with ?merged=1: "Cadastros mesclados."
export function MergedNotice() {
  const t = useTranslations("patientMerge");
  if (useSearchParams().get("merged") !== "1") return null;
  return <p role="status" className="mb-4 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{t("done")}</p>;
}
