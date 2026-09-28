"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { buddhistYearOf, looksBuddhistEra } from "@/lib/buddhistEra";

// A typed date field (birth dates, the schedule's dates). A year that looks
// Buddhist-era (≥ 2400) blocks the form's submit with a message; it's never
// converted. The browser's picker is always Gregorian, so on a birth date
// (`buddhistHint`) Thai shows the picked date's Buddhist-era year under it.
// Works controlled (value/onChange) or in a plain form (name/defaultValue).
export function DateInput({
  value,
  defaultValue,
  onChange,
  buddhistHint = false,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  buddhistHint?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("dateInput");
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const ref = useRef<HTMLInputElement>(null);
  const wrongEra = looksBuddhistEra(current);
  const message = t("buddhistYear");

  useEffect(() => {
    ref.current?.setCustomValidity(wrongEra ? message : "");
  }, [wrongEra, message]);

  const beYear = buddhistHint && locale === "th" ? buddhistYearOf(current) : null;

  return (
    <>
      <input
        {...rest}
        ref={ref}
        type="date"
        value={current}
        onChange={(e) => {
          if (value === undefined) setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        aria-invalid={wrongEra || undefined}
        className={className}
      />
      {wrongEra ? (
        <p role="alert" className="mt-1 text-xs text-red-600">{message}</p>
      ) : beYear !== null ? (
        <p className="mt-0.5 text-xs text-slate-500">พ.ศ. {beYear}</p>
      ) : null}
    </>
  );
}
