import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";
import { formatDateRangeLabel, formatShortDate } from "@/lib/dateLabels";

// UX (5 Oct): on staff screens, visit and money dates are in the PRACTICE's
// calendar, in the reader's words, never with an era; system and birth
// dates stay in the reader's (no calendar passed).

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard/schedule",
  useSearchParams: () => new URLSearchParams(),
}));

import { calendarHeaderLabel } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/CalendarView";
import { ScheduleNav } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { PracticeCalendarProvider } from "@/components/PracticeCalendar";

const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

describe("the calendar views' header", () => {
  it("a TH clinic for a pt reader: 2569, Portuguese words, no era", () => {
    for (const view of ["day", "week", "month"] as const) {
      const label = calendarHeaderLabel("pt-BR", view, "2026-10-09", week, "buddhist");
      expect(label).toContain("2569");
      expect(label).not.toMatch(/BE|E\.B\./);
    }
    expect(calendarHeaderLabel("pt-BR", "month", "2026-10-09", week, "buddhist")).toBe("outubro de 2569");
  });

  it("a BR clinic for a Thai reader: Thai words, 2026", () => {
    expect(calendarHeaderLabel("th", "month", "2026-10-09", week, "gregorian")).toBe("ตุลาคม 2026");
    expect(formatDateRangeLabel("th", week[0], week[6], { month: "short", day: "numeric", year: "numeric" }, "gregorian")).toContain("2026");
  });

  it("without a practice calendar (system / birth dates): the reader's, as before", () => {
    expect(formatShortDate("th", "1990-05-14")).toBe("14/05/2533");
    expect(formatShortDate("pt-BR", "1990-05-14")).toBe("14/05/1990");
  });
});

describe("the Agenda's day header", () => {
  it("follows the practice calendar from the dashboard (a Thai secretary at a BR clinic sees 2026)", () => {
    render(
      <NextIntlClientProvider locale="th" messages={th}>
        <PracticeCalendarProvider calendar="gregorian">
          <ScheduleNav currentDate="2026-10-09" today="2026-10-09" />
        </PracticeCalendarProvider>
      </NextIntlClientProvider>,
    );
    expect(document.body.textContent).toContain("2026");
    expect(document.body.textContent).not.toContain("2569");
  });

  it("a pt secretary at a TH clinic sees 2569, no era", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PracticeCalendarProvider calendar="buddhist">
          <ScheduleNav currentDate="2026-10-09" today="2026-10-09" />
        </PracticeCalendarProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/2569/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/2569 BE/);
  });
});
