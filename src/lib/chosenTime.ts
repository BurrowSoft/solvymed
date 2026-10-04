import { dateLocale, formatTimeLabel } from "@/lib/dateLabels";
import type { CountryProfile } from "@/lib/country";

// "Horário escolhido: sex., 3 out · 14:00–14:30" (38's format). The parts
// are in the PRACTICE's language (the app's docDateLocale: its country's
// fallbackLocale), the label around them in the page's; the month keeps
// its trailing "." only where the country says so (shortMonthKeepsDot).
// No year.
// reader (every screen now: patients Q4 2 Oct, staff UX 5 Oct): the words in the reader's language
// instead (the line has no year, so the calendar never shows); a Thai short
// month keeps its "." ("ต.ค."), others drop it.
export function chosenTimeParts(date: string, start: string, end: string, practice: Pick<CountryProfile, "fallbackLocale" | "shortMonthKeepsDot">, reader?: string) {
  const d = new Date(date + "T12:00:00");
  const loc = reader ?? practice.fallbackLocale;
  const keepDot = reader ? reader === "th" : practice.shortMonthKeepsDot;
  const month = d.toLocaleDateString(dateLocale(loc), { month: "short" });
  return {
    weekday: d.toLocaleDateString(dateLocale(loc), { weekday: "short" }),
    day: String(d.getDate()),
    month: keepDot ? month : month.replace(/\.$/, ""),
    start: formatTimeLabel(loc, start),
    end: formatTimeLabel(loc, end),
  };
}
