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
// The search's state (01, 10-26; the app the same): while it runs, "Buscando…"
// and no unregistered row, so an existing patient isn't booked without their
// record before the matches arrive; no match → "Nenhum cadastro encontrado:
// será agendado sem cadastro"; a failed search → "Não foi possível buscar." +
// "Tentar novamente", and the unregistered booking only via "Agendar sem
// cadastro mesmo assim". onStatusChange tells the form: blocked = Save waits (a
// search runs, or it failed until a retry works or "mesmo assim"); unlinked =
// matches are listed but none picked (Save works, it may be a new person, and
// the form shows "Toque em um paciente da lista…"; never an automatic pick).
export function PatientPicker({
  search,
  placeholder,
  defaultValue = "",
  inputClassName,
  onStatusChange,
}: {
  search: (q: string) => Promise<Patient[]>;
  placeholder?: string;
  defaultValue?: string;
  inputClassName?: string;
  onStatusChange?: (s: { blocked: boolean; unlinked: boolean }) => void;
}) {
  const t = useTranslations("schedule");
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [picked, setPicked] = useState<Patient | null>(null);
  const [matches, setMatches] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "failed">("idle");
  const [anyway, setAnyway] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const blocked = !picked && text.trim() !== "" && (status === "pending" || (status === "failed" && !anyway));
  const unlinked = !picked && text.trim() !== "" && status === "done" && matches.length > 0;
  const onStatus = useRef(onStatusChange);
  onStatus.current = onStatusChange;
  useEffect(() => { onStatus.current?.({ blocked, unlinked }); }, [blocked, unlinked]);
  useEffect(() => () => onStatus.current?.({ blocked: false, unlinked: false }), []);

  const typed = text.trim();
  const exact = matches.some((m) => m.full_name.trim().toLowerCase() === typed.toLowerCase());
  // The rows: the matches, then "Agendar sem cadastro: …" unless it is an exact name,
  // only once the search has answered (no match: the hint, still selectable).
  const rows: ({ kind: "patient"; p: Patient } | { kind: "new" })[] = [
    ...matches.map((p) => ({ kind: "patient" as const, p })),
    ...(typed && !exact && status === "done" ? [{ kind: "new" as const }] : []),
  ];

  function runSearch(q: string) {
    setStatus("pending");
    search(q).then(
      (found) => { if (latest.current === q) { setMatches(found); setStatus("done"); } },
      () => { if (latest.current === q) { setMatches([]); setStatus("failed"); } },
    );
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setText(q);
    setPicked(null);
    setActive(-1);
    setAnyway(false);
    latest.current = q;
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setMatches([]); setOpen(false); setStatus("idle"); return; }
    setOpen(true);
    // Pending from the first keystroke (the debounce too): nothing to book by name yet.
    setStatus("pending");
    timer.current = setTimeout(() => runSearch(q), 200);
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
    // Closes the list only, not the dialog around it.
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); setActive(-1); }
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
      {open && (rows.length > 0 || status === "pending") && (
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
              {row.kind === "patient" ? row.p.full_name : matches.length === 0 ? t("pickerNoMatch") : t("newPatientOption", { name: typed })}
            </li>
          ))}
          {status === "pending" && (
            <li role="option" aria-disabled="true" aria-selected={false} data-testid="picker-searching" className="px-3.5 py-2 text-sm text-slate-500">{t("pickerSearching")}</li>
          )}
        </ul>
      )}
      {status === "failed" && typed && !picked && (
        <div role="alert" data-testid="picker-failed" className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-red-700">{t("pickerFailed")}</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(true); runSearch(latest.current); }} className="font-semibold text-teal-700 underline underline-offset-2">{t("pickerRetry")}</button>
          {!anyway && (
            <button type="button" onClick={() => setAnyway(true)} className="font-semibold text-slate-600 underline underline-offset-2">{t("pickerAnyway")}</button>
          )}
        </div>
      )}
    </div>
  );
}
