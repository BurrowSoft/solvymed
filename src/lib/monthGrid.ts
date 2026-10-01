// A month as calendar weeks (Sunday first): ISO dates, null for the cells
// before the 1st and after the last day. Dates are local calendar days
// ("YYYY-MM-DD"), never times, so no time zone shifts them.
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// The months ("YYYY-MM") a list of dates spans, in order.
export function monthsOf(dates: readonly string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
}
