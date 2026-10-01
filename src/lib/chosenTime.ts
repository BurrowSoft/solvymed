import { dateLocale, formatTimeLabel } from "@/lib/dateLabels";
import type { CountryProfile } from "@/lib/country";

// "Horário escolhido: sex., 3 out · 14:00–14:30" (38's format). The parts
// are in the PRACTICE's language (the app's docDateLocale: its country's
// fallbackLocale), the label around them in the page's; the month keeps
// its trailing "." only where the country says so (shortMonthKeepsDot).
// No year.
export function chosenTimeParts(date: string, start: string, end: string, practice: Pick<CountryProfile, "fallbackLocale" | "shortMonthKeepsDot">) {
  const d = new Date(date + "T12:00:00");
  const loc = practice.fallbackLocale;
  const month = d.toLocaleDateString(dateLocale(loc), { month: "short" });
  return {
    weekday: d.toLocaleDateString(dateLocale(loc), { weekday: "short" }),
    day: String(d.getDate()),
    month: practice.shortMonthKeepsDot ? month : month.replace(/\.$/, ""),
    start: formatTimeLabel(loc, start),
    end: formatTimeLabel(loc, end),
  };
}
