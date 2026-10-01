"use client";

import { useTranslations } from "next-intl";
import { consultTypeKey } from "@/lib/consultType";

// An appointment's type in the reader's language (the canonical keys), or
// as written (a procedure's name).
export function ConsultTypeLabel({ value }: { value: string | null | undefined }) {
  const t = useTranslations("consultType");
  const key = consultTypeKey(value);
  return <>{key ? t(key) : value ?? ""}</>;
}
