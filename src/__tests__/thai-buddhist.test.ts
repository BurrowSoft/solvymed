import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dateLocale, formatDateLabel, formatShortDate } from "@/lib/dateLabels";

// Thai dates show the Buddhist year (Sprint TH). "th" alone only gives it
// where the runtime's default calendar for Thai is Buddhist, so the web asks
// for it explicitly. These checks don't rely on the runtime's default.
describe("Thai dates: the Buddhist calendar is requested explicitly", () => {
  const d = new Date(Date.UTC(2026, 8, 28, 12));
  const year = (locale: string) =>
    new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).formatToParts(d).find((p) => p.type === "year")!.value;

  it("dateLocale('th') asks for the Buddhist calendar; other locales are unchanged", () => {
    expect(dateLocale("th")).toBe("th-TH-u-ca-buddhist");
    expect(dateLocale("pt-BR")).toBe("pt-BR");
    expect(dateLocale("en")).toBe("en-GB"); // English ≠ American (build 25)
  });

  it("gives 2569 even where Thai's default would be Gregorian (2026)", () => {
    expect(year("th-TH-u-ca-gregory")).toBe("2026");
    expect(year(dateLocale("th"))).toBe("2569");
  });

  it("formatDateLabel shows the Buddhist year in Thai, the Gregorian one elsewhere", () => {
    expect(formatDateLabel("th", "2026-09-28", { year: "numeric", month: "short", day: "numeric" })).toContain("2569");
    expect(formatDateLabel("pt-BR", "2026-09-28", { year: "numeric", month: "short", day: "numeric" })).toContain("2026");
  });

  it("formatShortDate: the locale's short date, like the app (birth dates, record dates)", () => {
    expect(formatShortDate("pt-BR", "1993-05-14")).toBe("14/05/1993");
    expect(formatShortDate("en", "1993-05-14")).toBe("14/05/1993");
    expect(formatShortDate("th", "1993-05-14")).toBe("14/05/2536");
  });

  // Every date formatter in the app goes through dateLocale, so a new one
  // can't quietly depend on the runtime's default calendar again.
  it("no date formatter in src passes the locale without dateLocale", () => {
    const root = join(__dirname, "..");
    // clinicTime/legalVersions format fixed-locale machine values (en-CA
    // dates, time zone math), never shown in Thai.
    const exempt = new Set(["clinicTime.ts", "legalVersions.ts", "dateLabels.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || exempt.has(name)) continue;
        const src = readFileSync(p, "utf8");
        const re = /(?:toLocaleDateString|toLocaleString|toLocaleTimeString|new Intl\.DateTimeFormat)\(\s*([^,)]*)/g;
        for (const m of src.matchAll(re)) {
          const arg = m[1].trim();
          if (arg && !arg.startsWith("dateLocale(") && !/^["'`]/.test(arg)) offenders.push(`${p.slice(root.length)}: ${m[0]}`);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
