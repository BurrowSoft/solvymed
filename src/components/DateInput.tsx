"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BIRTH_DATE_MIN, birthDateOutOfRange, buddhistYearOf, localToday, looksBuddhistEra } from "@/lib/buddhistEra";

// A typed date field (birth dates, the schedule's dates). A year that looks
// Buddhist-era (≥ 2400) blocks the form's submit with a message; it's never
// converted. On a birth date (`birthDate`) the date must also be between
// 1900-01-01 and today (the database refuses anything else, 116), and,
// because the browser's picker is always Gregorian, Thai shows the picked
// date's Buddhist-era year under it. Works controlled (value/onChange) or in
// a plain form (name/defaultValue).
export function DateInput({
  value,
  defaultValue,
  onChange,
  birthDate = false,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  birthDate?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("dateInput");
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const ref = useRef<HTMLInputElement>(null);
  // The browser's own today, read after mount: a server render (a form
  // opened by ?new=1) would otherwise fix it to the server's UTC date, a day
  // early for Asia in the morning (tester).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(localToday()); }, []);
  const message = looksBuddhistEra(current)
    ? t("buddhistYear")
    : birthDate && today !== null && birthDateOutOfRange(current, today)
      ? t("invalidBirthDate")
      : "";

  useEffect(() => {
    ref.current?.setCustomValidity(message);
  }, [message]);

  const beYear = birthDate && locale === "th" ? buddhistYearOf(current) : null;

  return (
    <>
      <input
        {...rest}
        {...(birthDate ? { min: BIRTH_DATE_MIN, ...(today ? { max: today } : {}) } : {})}
        ref={ref}
        type="date"
        value={current}
        onChange={(e) => {
          if (value === undefined) setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        aria-invalid={message ? true : undefined}
        className={className}
      />
      {message ? (
        <p role="alert" className="mt-1 text-xs text-red-600">{message}</p>
      ) : beYear !== null ? (
        <p className="mt-0.5 text-xs text-slate-500">พ.ศ. {beYear}</p>
      ) : null}
    </>
  );
}
