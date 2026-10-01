"use client";

import { useMemo, useState } from "react";
import { dateLocale } from "@/lib/dateLabels";
import { monthGrid, monthsOf } from "@/lib/monthGrid";

// Vitor's item 7: a month calendar instead of the horizontal day strip.
// Patient (default): only the bookable days are enabled; a day the clinic
// doesn't open is greyed (isOpen false); the months shown are the ones the
// days span. Doctor (free): any month, any day; a closed day is greyed but
// still tappable (the save asks to confirm), as the app's #243.
function shiftMonth(ym: string, by: number): string {
  const [y, mo] = ym.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({
  days,
  selected,
  onSelect,
  isOpen,
  locale,
  labels,
  free = false,
}: {
  days: readonly string[];
  selected: string | null;
  onSelect: (day: string) => void;
  isOpen: (day: string) => boolean;
  locale: string;
  labels: { prev: string; next: string };
  free?: boolean;
}) {
  const months = useMemo(() => monthsOf(days), [days]);
  const [monthIdx, setMonthIdx] = useState(() => Math.max(0, months.indexOf((selected ?? days[0] ?? "").slice(0, 7))));
  // Free mode: the shown month, moved by ‹ › without limits.
  const [freeYm, setFreeYm] = useState(() => (selected ?? days[0] ?? "").slice(0, 7));
  const ym = free ? freeYm : months[Math.min(monthIdx, months.length - 1)] ?? "";
  const [year, month] = ym.split("-").map(Number);
  const bookable = useMemo(() => new Set(days), [days]);
  if (!ym) return null;

  const title = new Date(year, month - 1, 15).toLocaleDateString(dateLocale(locale), { month: "long", year: "numeric" });
  // Weekday initials, Sunday first (a known Sunday: 2023-01-01).
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(dateLocale(locale), { weekday: "narrow" }));

  return (
    <div data-testid="month-calendar" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => (free ? setFreeYm(shiftMonth(freeYm, -1)) : setMonthIdx((i) => i - 1))} disabled={!free && monthIdx <= 0} aria-label={labels.prev} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">‹</button>
        <p className="text-sm font-bold capitalize text-slate-800">{title}</p>
        <button type="button" onClick={() => (free ? setFreeYm(shiftMonth(freeYm, 1)) : setMonthIdx((i) => i + 1))} disabled={!free && monthIdx >= months.length - 1} aria-label={labels.next} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w, i) => <span key={i} className="text-[11px] font-semibold uppercase text-slate-400">{w}</span>)}
        {monthGrid(year, month - 1).flat().map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const open = isOpen(day);
          const can = free || (bookable.has(day) && open);
          const dim = free && !open;
          const active = day === selected;
          return (
            <button
              key={day}
              type="button"
              disabled={!can}
              aria-pressed={active}
              onClick={() => onSelect(day)}
              className={`aspect-square rounded-lg text-sm font-semibold transition ${active ? "bg-teal-600 text-white" : !can ? "text-slate-300" : dim ? "text-slate-300 hover:bg-slate-50" : "text-slate-700 hover:bg-teal-50"}`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
