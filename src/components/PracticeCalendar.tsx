"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DateCalendar } from "@/lib/dateLabels";

// Staff screens (UX, 5 Oct): visit and money dates (the Agenda, Home,
// Payments, a patient's history, requests) are in the PRACTICE's calendar
// (a TH clinic in BE, a BR clinic Gregorian), in the reader's words. System
// dates (access log, team, files) and birth dates stay in the reader's. Set
// by the dashboard layout from the practice being worked on.
const PracticeCalendarContext = createContext<DateCalendar | undefined>(undefined);

export function PracticeCalendarProvider({ calendar, children }: { calendar: DateCalendar; children: ReactNode }) {
  return <PracticeCalendarContext.Provider value={calendar}>{children}</PracticeCalendarContext.Provider>;
}

// One item's practice (166 "Todos": a row, a request, a create form for a
// chosen doctor): that practice's calendar inside; none given, the page's.
export function ItemCalendar({ calendar, children }: { calendar?: DateCalendar; children: ReactNode }) {
  return calendar ? <PracticeCalendarContext.Provider value={calendar}>{children}</PracticeCalendarContext.Provider> : <>{children}</>;
}

export function usePracticeCalendar(): DateCalendar | undefined {
  return useContext(PracticeCalendarContext);
}
