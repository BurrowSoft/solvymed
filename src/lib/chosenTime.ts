import { dateLocale, formatTimeLabel } from "@/lib/dateLabels";

// "Horário escolhido: sex., 3 out · 14:00–14:30" (38's format). The parts
// are in the PRACTICE's locale (the app's docDateLocale: its country's
// language), the label around them in the page's; the month loses its
// trailing "." except in Thai. No year.
export function chosenTimeParts(date: string, start: string, end: string, practiceLocale: string) {
  const d = new Date(date + "T12:00:00");
  const month = d.toLocaleDateString(dateLocale(practiceLocale), { month: "short" });
  return {
    weekday: d.toLocaleDateString(dateLocale(practiceLocale), { weekday: "short" }),
    day: String(d.getDate()),
    month: practiceLocale === "th" ? month : month.replace(/\.$/, ""),
    start: formatTimeLabel(practiceLocale, start),
    end: formatTimeLabel(practiceLocale, end),
  };
}
