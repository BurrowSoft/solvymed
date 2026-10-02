"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { birthDateOutOfRange, buddhistYearOf, localToday, looksBuddhistEra } from "@/lib/buddhistEra";
import { formatMaskedDate, isoFromMasked, maskedFromIso } from "@/lib/maskedDate";

// A typed date field (birth dates, the schedule's dates): our own masked
// dd/mm/yyyy text field, never the browser's native date input, which
// follows the browser's locale and showed "mm/dd/yyyy" (Vitor, build 25:
// "that format must appear nowhere"). Slashes are inserted as you type;
// the value handed on (onChange, and the hidden `name` field in a plain
// form) is "YYYY-MM-DD" once the date is complete and real, else "".
// A year that looks Buddhist-era (≥ 2400) blocks the form's submit with a
// message; it's never converted. On a birth date (`birthDate`) the date
// must also be between 1900-01-01 and today (the database refuses anything
// else, 116), and Thai shows its Buddhist-era year under it. Works
// controlled (value/onChange) or in a plain form (name/defaultValue).
export function DateInput({
  value,
  defaultValue,
  onChange,
  birthDate = false,
  className,
  name,
  required,
  id,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  birthDate?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("dateInput");
  const [text, setText] = useState(() => maskedFromIso(value ?? defaultValue ?? ""));
  // A controlled value set from outside (a picker, a reset) shows here.
  const lastIso = useRef(value ?? defaultValue ?? "");
  useEffect(() => {
    if (value !== undefined && value !== lastIso.current) {
      lastIso.current = value;
      setText(maskedFromIso(value));
    }
  }, [value]);
  const iso = isoFromMasked(text);
  const ref = useRef<HTMLInputElement>(null);
  // The browser's own today, read after mount: a server render (a form
  // opened by ?new=1) would otherwise fix it to the server's UTC date, a day
  // early for Asia in the morning (tester).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(localToday()); }, []);
  const digits = text.replace(/\D/g, "").length;
  const message =
    digits > 0 && !iso
      ? t("invalid", { format: t("placeholder") })
      : looksBuddhistEra(iso)
        ? t("buddhistYear")
        : birthDate && today !== null && birthDateOutOfRange(iso, today)
          ? t("invalidBirthDate")
          : "";

  useEffect(() => {
    ref.current?.setCustomValidity(message);
  }, [message]);

  const beYear = birthDate && locale === "th" ? buddhistYearOf(iso) : null;

  return (
    <>
      <input
        {...rest}
        id={id}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete={birthDate ? "bday" : "off"}
        placeholder={t("placeholder")}
        maxLength={10}
        required={required}
        value={text}
        onChange={(e) => {
          const next = formatMaskedDate(e.target.value);
          setText(next);
          const nextIso = isoFromMasked(next);
          // A Buddhist-era-looking year is handed on as typed (the form's
          // own guard refuses it); an impossible or partial date as "".
          lastIso.current = nextIso;
          onChange?.(nextIso);
        }}
        aria-invalid={message ? true : undefined}
        className={className}
      />
      {name && <input type="hidden" name={name} value={iso} />}
      {message ? (
        <p role="alert" className="mt-1 text-xs text-red-600">{message}</p>
      ) : beYear !== null ? (
        <p className="mt-0.5 text-xs text-slate-500">พ.ศ. {beYear}</p>
      ) : null}
    </>
  );
}
