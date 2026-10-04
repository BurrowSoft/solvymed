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

export function usePracticeCalendar(): DateCalendar | undefined {
  return useContext(PracticeCalendarContext);
}
