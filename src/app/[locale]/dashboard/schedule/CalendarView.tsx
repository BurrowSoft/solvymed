"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppointmentStatusSelect, DeleteAppointmentButton } from "./ScheduleClient";

export type CalendarAppt = {
  id: string;
  date: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  type: string;
  consultation_type: string;
  payment_status: string;
  payment_amount?: number;
  notes?: string;
};

const HOUR_H = 64;
const FIRST_H = 7;
const LAST_H = 21;
const HOURS = Array.from({ length: LAST_H - FIRST_H }, (_, i) => i + FIRST_H);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function toMins(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function apptTop(startTime: string) { return ((toMins(startTime) - FIRST_H * 60) / 60) * HOUR_H; }
function apptHeight(dur: number) { return Math.max((dur / 60) * HOUR_H, 20); }

function addDaysTo(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return isoDate(day);
  });
}

function getMonthGrid(dateStr: string): string[][] {
  const d = new Date(dateStr + "T12:00:00");
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const fdow = firstDay.getDay();
  const start = new Date(firstDay);
  start.setDate(start.getDate() - (fdow === 0 ? 6 : fdow - 1));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d2 = 0; d2 < 7; d2++) {
      const curr = new Date(start);
      curr.setDate(start.getDate() + w * 7 + d2);
      week.push(isoDate(curr));
    }
    weeks.push(week);
    const lastOfMonth = new Date(year, month + 1, 0);
    if (w >= 4 && new Date(week[6] + "T12:00:00") >= lastOfMonth) break;
  }
  return weeks;
}

function blockStyle(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-50 border-l-4 border-teal-500 text-teal-900 shadow-sm";
    case "scheduled":  return "bg-amber-50 border-l-4 border-amber-400 text-amber-900";
    case "completed":  return "bg-green-50 border-l-4 border-green-500 text-green-900 opacity-70";
    case "cancelled":  return "bg-slate-50 border-l-4 border-slate-300 text-slate-400";
    case "blocked":    return "bg-slate-100 border-l-4 border-slate-400 text-slate-500 italic";
    case "late":       return "bg-orange-50 border-l-4 border-orange-400 text-orange-900";
    case "absent":     return "bg-red-50 border-l-4 border-red-400 text-red-800";
    default:           return "bg-blue-50 border-l-4 border-blue-400 text-blue-900";
  }
}

function chipStyle(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-800";
    case "scheduled":  return "bg-amber-100 text-amber-800";
    case "completed":  return "bg-green-100 text-green-800";
    case "cancelled":  return "bg-slate-100 text-slate-400";
    case "blocked":    return "bg-slate-200 text-slate-500";
    case "late":       return "bg-orange-100 text-orange-800";
    case "absent":     return "bg-red-100 text-red-700";
    default:           return "bg-blue-100 text-blue-800";
  }
}

// ─── Time grid (day + week) ────────────────────────────────────────────────
function TimeGrid({
  days,
  appointments,
  today,
  onSelect,
  onDayClick,
  showHeaders,
}: {
  days: string[];
  appointments: CalendarAppt[];
  today: string;
  onSelect: (a: CalendarAppt) => void;
  onDayClick?: (day: string) => void;
  showHeaders: boolean;
}) {
  const byDay = new Map<string, CalendarAppt[]>();
  for (const day of days) byDay.set(day, appointments.filter(a => a.date === day));

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMins - FIRST_H * 60) / 60) * HOUR_H;
  const showNow = nowMins >= FIRST_H * 60 && nowMins <= LAST_H * 60;

  return (
    <div className="flex">
      {/* Time gutter */}
      <div className="shrink-0 w-14 border-r border-slate-100 bg-white">
        {showHeaders && <div className="h-12 border-b border-slate-100" />}
        {HOURS.map(h => (
          <div key={h} style={{ height: HOUR_H }} className="relative border-b border-slate-100">
            <span className="absolute -top-2.5 right-2 text-[10px] font-medium text-slate-400 select-none">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day, ci) => {
        const appts = byDay.get(day) ?? [];
        const isToday = day === today;
        const d = new Date(day + "T12:00:00");
        return (
          <div key={day} className="relative flex-1 min-w-[110px] border-r border-slate-100 last:border-r-0">
            {showHeaders && (
              <div className={`h-12 flex flex-col items-center justify-center border-b ${isToday ? "bg-teal-50 border-teal-100" : "bg-white border-slate-100"}`}>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{WEEKDAYS[ci]}</span>
                <button
                  className={`mt-0.5 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center transition ${isToday ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  onClick={() => onDayClick?.(day)}
                >
                  {d.getDate()}
                </button>
              </div>
            )}
            <div className="relative" style={{ height: HOURS.length * HOUR_H }}>
              {/* Grid lines */}
              {HOURS.map((_, i) => (
                <div key={i} className="absolute w-full border-b border-slate-100" style={{ top: (i + 1) * HOUR_H }} />
              ))}
              {HOURS.map((_, i) => (
                <div key={`h${i}`} className="absolute w-full border-b border-slate-50" style={{ top: i * HOUR_H + HOUR_H / 2 }} />
              ))}
              {/* Now line */}
              {isToday && showNow && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top: nowTop }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0 -ml-1" />
                  <div className="flex-1 h-px bg-teal-500" />
                </div>
              )}
              {/* Appointment blocks */}
              {appts.map(appt => {
                const top = apptTop(appt.start_time);
                const height = apptHeight(appt.duration_minutes);
                if (top + height < 0 || top > HOURS.length * HOUR_H) return null;
                return (
                  <button
                    key={appt.id}
                    style={{ top: Math.max(top, 0), height, left: 3, right: 3 }}
                    className={`absolute rounded-r-lg px-1.5 py-1 text-left overflow-hidden cursor-pointer transition hover:brightness-95 hover:shadow-md ${blockStyle(appt.status)}`}
                    onClick={() => onSelect(appt)}
                  >
                    <p className="text-[11px] font-bold leading-tight truncate">{appt.patient_name}</p>
                    {height >= 34 && (
                      <p className="text-[10px] leading-tight truncate opacity-75">
                        {appt.start_time?.slice(0, 5)} · {appt.consultation_type}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month grid ────────────────────────────────────────────────────────────
function MonthGrid({
  currentDate,
  appointments,
  today,
  onSelect,
  onDayClick,
}: {
  currentDate: string;
  appointments: CalendarAppt[];
  today: string;
  onSelect: (a: CalendarAppt) => void;
  onDayClick: (day: string) => void;
}) {
  const grid = getMonthGrid(currentDate);
  const currentMonth = new Date(currentDate + "T12:00:00").getMonth();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{d}</div>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map(day => {
            const dayAppts = appointments.filter(a => a.date === day);
            const d = new Date(day + "T12:00:00");
            const inMonth = d.getMonth() === currentMonth;
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`min-h-[84px] p-1.5 border-b border-r border-slate-100 last:border-r-0 cursor-pointer hover:bg-slate-50 transition ${!inMonth ? "bg-slate-50/60" : ""}`}
                onClick={() => onDayClick(day)}
              >
                <div className="flex justify-center mb-1">
                  <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-teal-600 text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayAppts.slice(0, 3).map(appt => (
                    <button
                      key={appt.id}
                      className={`w-full text-left rounded px-1 py-0.5 text-[10px] font-semibold truncate ${chipStyle(appt.status)}`}
                      onClick={e => { e.stopPropagation(); onSelect(appt); }}
                    >
                      {appt.start_time?.slice(0, 5)} {appt.patient_name}
                    </button>
                  ))}
                  {dayAppts.length > 3 && (
                    <p className="text-[10px] text-slate-400 pl-1">+{dayAppts.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────
export function CalendarView({
  appointments,
  currentDate,
  view,
}: {
  appointments: CalendarAppt[];
  currentDate: string;
  view: "day" | "week" | "month";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const today = isoDate(new Date());
  const [selected, setSelected] = useState<CalendarAppt | null>(null);

  function go(date: string, v = view) {
    router.push(`${pathname}?date=${date}&view=${v}`);
  }

  function navPrev() {
    if (view === "day") go(addDaysTo(currentDate, -1));
    else if (view === "week") go(addDaysTo(currentDate, -7));
    else { const d = new Date(currentDate + "T12:00:00"); d.setMonth(d.getMonth() - 1); go(isoDate(d)); }
  }
  function navNext() {
    if (view === "day") go(addDaysTo(currentDate, 1));
    else if (view === "week") go(addDaysTo(currentDate, 7));
    else { const d = new Date(currentDate + "T12:00:00"); d.setMonth(d.getMonth() + 1); go(isoDate(d)); }
  }

  const headerLabel = (() => {
    if (view === "day") return new Date(currentDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const days = getWeekDays(currentDate);
      const f = new Date(days[0] + "T12:00:00");
      const l = new Date(days[6] + "T12:00:00");
      return f.getMonth() === l.getMonth()
        ? `${f.toLocaleDateString("en-US", { month: "long" })} ${f.getDate()}–${l.getDate()}, ${f.getFullYear()}`
        : `${f.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${l.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return new Date(currentDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  })();

  return (
    <div>
      {/* Calendar nav */}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={navPrev} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="min-w-[200px] text-center text-sm font-bold text-slate-900">{headerLabel}</span>
        <button onClick={navNext} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        {currentDate !== today && (
          <button onClick={() => go(today)} className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition">Today</button>
        )}
      </div>

      {/* Calendar body */}
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        {(view === "day" || view === "week") && (
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 330px)" }}>
            <TimeGrid
              days={view === "day" ? [currentDate] : getWeekDays(currentDate)}
              appointments={appointments}
              today={today}
              onSelect={setSelected}
              onDayClick={day => go(day, "day")}
              showHeaders={view === "week"}
            />
          </div>
        )}
        {view === "month" && (
          <MonthGrid
            currentDate={currentDate}
            appointments={appointments}
            today={today}
            onSelect={setSelected}
            onDayClick={day => go(day, "day")}
          />
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 truncate">{selected.patient_name}</p>
                <p className="text-sm text-slate-500">{selected.consultation_type}</p>
              </div>
              <button onClick={() => setSelected(null)} className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-slate-400 shrink-0"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                {new Date(selected.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-slate-400 shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {selected.start_time?.slice(0, 5)} – {selected.end_time?.slice(0, 5)} ({selected.duration_minutes} min)
              </div>
              {selected.payment_amount != null && (
                <div className={`flex items-center gap-2 text-xs font-semibold ${selected.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  {selected.payment_status === "paid" ? "✓ Paid" : "⏳ Pending"} · R$ {selected.payment_amount.toFixed(2)}
                </div>
              )}
              {selected.notes && <p className="text-[11px] text-slate-400 italic pl-5">{selected.notes}</p>}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {selected.status === "blocked"
                ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Blocked</span>
                : <AppointmentStatusSelect id={selected.id} current={selected.status} />
              }
              <DeleteAppointmentButton id={selected.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
