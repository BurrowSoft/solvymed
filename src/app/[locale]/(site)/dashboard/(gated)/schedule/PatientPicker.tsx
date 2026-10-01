"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Patient = { id: string; full_name: string };

// The New Appointment patient field (Vitor's test, 29/30): suggestions as
// you type from the first letter (names containing it, from the server
// search), in our own dropdown rather than a native <datalist> (which many
// browsers barely show), plus "Agendar sem cadastro: {texto}" (UX: no record
// is created) at the end. Picking
// an existing patient books by id (two patients can share a name); typing
// or picking "Agendar sem cadastro" books by the typed name, as before.
export function PatientPicker({
  search,
  placeholder,
  defaultValue = "",
  inputClassName,
}: {
  search: (q: string) => Promise<Patient[]>;
  placeholder?: string;
  defaultValue?: string;
  inputClassName?: string;
}) {
  const t = useTranslations("schedule");
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [picked, setPicked] = useState<Patient | null>(null);
  const [matches, setMatches] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const typed = text.trim();
  const exact = matches.some((m) => m.full_name.trim().toLowerCase() === typed.toLowerCase());
  // The rows: the matches, then "Agendar sem cadastro: …" unless it is an exact name.
  const rows: ({ kind: "patient"; p: Patient } | { kind: "new" })[] = [
    ...matches.map((p) => ({ kind: "patient" as const, p })),
    ...(typed && !exact ? [{ kind: "new" as const }] : []),
  ];

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setText(q);
    setPicked(null);
    setActive(-1);
    latest.current = q;
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setMatches([]); setOpen(false); return; }
    setOpen(true);
    timer.current = setTimeout(async () => {
      try {
        const found = await search(q);
        if (latest.current === q) setMatches(found);
      } catch {
        // Suggestions are optional: a failed lookup shows only "Agendar sem cadastro".
        if (latest.current === q) setMatches([]);
      }
    }, 200);
  }

  function choose(i: number) {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "patient") { setPicked(row.p); setText(row.p.full_name); }
    else setPicked(null);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? rows.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  }

  return (
    <div className="relative">
      {picked && <input type="hidden" name="patient_id" value={picked.id} />}
      <input
        name="patient_name"
        required
        autoComplete="off"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => { if (typed) setOpen(true); }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {open && rows.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {rows.map((row, i) => (
            <li
              key={row.kind === "patient" ? row.p.id : "new"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, so the choice lands before the input's blur closes the list.
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3.5 py-2 text-sm ${i === active ? "bg-teal-50 text-teal-900" : "text-slate-700"} ${row.kind === "new" ? "border-t border-slate-100 font-semibold text-teal-700" : ""}`}
            >
              {row.kind === "patient" ? row.p.full_name : t("newPatientOption", { name: typed })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
