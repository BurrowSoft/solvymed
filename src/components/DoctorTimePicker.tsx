"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MonthCalendar } from "@/components/MonthCalendar";
import { doctorTimeChips } from "@/lib/doctorTimes";
import { chosenTimeParts } from "@/lib/chosenTime";
import { countryProfile } from "@/lib/country";
import { getScheduleDay } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/actions";
import { useRowAction } from "@/components/RowPractice";

type Day = Awaited<ReturnType<typeof getScheduleDay>>;

const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// The doctor's date + time picker (item 10, the same as app #243): a month
// calendar (any day; closed days greyed but tappable), a 4/5-column grid of
// 15-minute times within the day's hours ("Mostrar fora do horário" widens
// to 06:00–22:00; outside / past-closing times greyed but pickable, taken
// ones marked; the save confirms or warns as before), "Outro horário…" for
// any time, and the chosen time above the button. It writes the form's
// date / start fields, so the existing server checks run unchanged.
export function DoctorTimePicker({
  defaultDate,
  defaultStart,
  duration,
  dateName = "date",
  startName = "start_time",
  excludeId,
  onChange,
}: {
  defaultDate: string;
  defaultStart?: string;
  duration: number;
  dateName?: string;
  startName?: string;
  /** The appointment being moved / answered: not taken against itself. */
  excludeId?: string;
  onChange?: (date: string, start: string) => void;
}) {
  const scheduleDay = useRowAction("getScheduleDay", getScheduleDay);
  const t = useTranslations("schedule");
  const tBook = useTranslations("book");
  const locale = useLocale();
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState(defaultStart?.slice(0, 5) ?? "");
  const [showOutside, setShowOutside] = useState(false);
  const [custom, setCustom] = useState(false);
  const [day, setDay] = useState<Day>(null);
  // The date `day` was loaded for: until then the grid waits (no BR
  // fallback flash in a Thai practice; d7).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    scheduleDay(date, excludeId).then(
      (d) => { if (mine === seq.current) { setDay(d); setLoadedFor(date); } },
      () => { if (mine === seq.current) { setDay(null); setLoadedFor(date); } },
    );
  }, [date, excludeId]); // eslint-disable-line react-hooks/exhaustive-deps -- scheduleDay is the same action (per row in "All")
  useEffect(() => { onChange?.(date, start); }, [date, start, onChange]);

  const chips = useMemo(
    () => doctorTimeChips({ hoursSet: !!day?.hoursSet, day: day?.day, showOutside, duration, taken: day?.taken ?? [] }),
    [day, showOutside, duration],
  );
  const open = (d: string) => !day?.hoursSet || day.openWeekdays.includes(new Date(d + "T12:00:00").getDay());
  const inGrid = chips.some((c) => c.time === start);
  const loading = loadedFor !== date;

  return (
    <div className="space-y-3">
      <input type="hidden" name={dateName} value={date} />
      <input type="hidden" name={startName} value={start} />
      <MonthCalendar
        days={[date]}
        selected={date}
        onSelect={(d) => { setDate(d); }}
        isOpen={open}
        locale={locale}
        labels={{ prev: tBook("prevMonth"), next: tBook("nextMonth") }}
        free
      />
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600">{t("startTime")} *</p>
          {day?.hoursSet && (
            <button type="button" onClick={() => setShowOutside((v) => !v)} className="text-xs font-semibold text-teal-700 hover:underline">
              {showOutside ? t("showInside") : t("showOutside")}
            </button>
          )}
        </div>
        <div data-testid="doctor-time-grid" aria-busy={loading} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {loading && Array.from({ length: 12 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}
          {!loading && chips.map((c) => {
            const active = c.time === start && !custom;
            return (
              <button
                key={c.time}
                type="button"
                aria-pressed={active}
                title={c.taken ? t("slotTaken") : undefined}
                onClick={() => { setStart(c.time); setCustom(false); }}
                className={`relative w-full rounded-lg border px-1 py-2 text-sm font-semibold transition ${
                  active ? "border-teal-600 bg-teal-600 text-white"
                    : c.outside ? "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-300"
                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-400"
                } ${c.taken && !active ? "line-through" : ""}`}
              >
                {c.taken && <span aria-hidden="true" className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-amber-500"}`} />}
                {c.time}
                {c.taken && <span className="sr-only"> · {t("slotTaken")}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setCustom(true)} className="mt-2 text-xs font-semibold text-teal-700 hover:underline">{t("otherTime")}</button>
        {(custom || (start && !inGrid)) && (
          <input
            type="time"
            aria-label={t("otherTime")}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-2 block w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        )}
      </div>
      {start && !loading && (
        <p data-testid="doctor-chosen-time" className="rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800">
          {tBook("chosenTime", chosenTimeParts(date, start, addMinutes(start, duration), countryProfile(day?.country)))}
        </p>
      )}
    </div>
  );
}
