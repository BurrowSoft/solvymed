import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Settings → Horário de atendimento (f0/53's Founders readiness checks):
// a new account's working_hours is '{}' (the column default), so the form
// showed every day off; it now shows the practice country's default week
// (lib/country, an explicit default for every country, the app's 08–18).
// And at 375 px the end time ran off the card: the rows wrap and the inputs
// shrink (jsdom can't measure; the tester row checks 375 px).

vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => ({}));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

import { initialHours, WorkingHoursForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { countryProfile } from "@/lib/country";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

describe("the default week", () => {
  it("every country has an explicit one (BR, TH and the default): Mon–Fri 08:00–18:00", () => {
    for (const c of ["BR", "TH", "ZZ", null]) {
      expect(countryProfile(c).defaultHours).toEqual({ days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "18:00" });
    }
  });

  it("nothing saved ({} or null) → the country's default; saved hours win", () => {
    for (const saved of [{}, null, undefined]) {
      const h = initialHours(saved as never, "TH");
      expect(DAYS.map((k) => h[k].enabled)).toEqual([true, true, true, true, true, false, false]);
      expect(h.mon).toEqual({ enabled: true, start: "08:00", end: "18:00" });
    }
    const mine = Object.fromEntries(DAYS.map((k) => [k, { enabled: k === "sat", start: "10:00", end: "14:00" }]));
    expect(initialHours(mine as never, "BR")).toBe(mine);
  });

  it("a new TH account's form shows Mon–Fri ticked, not every day off", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><WorkingHoursForm workingHours={{} as never} country="TH" /></NextIntlClientProvider>);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true, true, true, false, false]);
  });

  it("375 px: the day rows wrap and the time inputs can shrink", () => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><WorkingHoursForm workingHours={null} country="BR" /></NextIntlClientProvider>);
    const end = container.querySelector('input[name="mon_end"]') as HTMLInputElement;
    expect(end.className).toContain("min-w-0");
    expect(end.parentElement!.className).toContain("min-w-0");
    expect(end.parentElement!.parentElement!.className).toContain("flex-wrap");
  });
});
