import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The agenda's "now" line is on the PRACTICE's clock, as its today column
// is (1c): a browser in another zone drew it at its own hour. Only Date is
// faked; the browser's own zone no longer matters.
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard/schedule",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions", () => ({ actForRow: vi.fn() }));

import { CalendarView } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/CalendarView";

// CalendarView's grid: 07:00 at the top, 64 px an hour.
const top = (hh: number, mm: number) => `${((hh * 60 + mm - 7 * 60) / 60) * 64}px`;

function nowTop(timeZone: string): string | null {
  const { container } = render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CalendarView appointments={[]} currentDate="2030-01-16" today="2030-01-16" view="day" timeZone={timeZone} />
    </NextIntlClientProvider>,
  );
  const line = container.querySelector<HTMLElement>(".calendar-now-line");
  return line ? line.style.getPropertyValue("--now-top") : null;
}

describe("the agenda's now line", () => {
  afterEach(() => vi.useRealTimers());

  it("at the practice's hour: 12:25 UTC is 09:25 in São Paulo, 19:25 in Bangkok", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-16T12:25:00Z"));
    expect(nowTop("America/Sao_Paulo")).toBe(top(9, 25));
  });

  it("the same instant for a Bangkok practice", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-16T12:25:00Z"));
    expect(nowTop("Asia/Bangkok")).toBe(top(19, 25));
  });
});
