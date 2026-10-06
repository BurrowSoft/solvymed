import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.8.0 F part 2: with 2+ locations, New appointment shows location chips
// preselecting the chosen day's (its hours, else the primary: what the
// database picks), and posts location_id only when the user picked another.

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({
  getScheduleDay: async () => null,
  createAppointment: vi.fn(),
  searchPatientsForPicker: async () => [],
  updateAppointmentStatus: vi.fn(), deleteAppointment: vi.fn(), blockTime: vi.fn(), moveAppointment: vi.fn(), undoScheduleChange: vi.fn(),
}));

import { NewAppointmentButton } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { PracticeLocationsProvider } from "@/components/PracticeLocations";

const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Unidade Centro", is_primary: true };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Unidade Sul", is_primary: false };

// 2030-01-14 is a Monday; Mondays are at Unidade Sul.
const open = (list: typeof A[]) => {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PracticeLocationsProvider value={{ list, hours: { mon: { location_id: B.id } } }}>
        <NewAppointmentButton defaultDate="2030-01-14" procedures={[]} />
      </PracticeLocationsProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText(pt.schedule.newAppt));
};
const checked = () => screen.getAllByTestId("location-chip").filter((c) => c.getAttribute("aria-checked") === "true").map((c) => c.textContent);
const posted = () => (document.querySelector('input[name="location_id"]') as HTMLInputElement | null)?.value ?? null;

describe("New appointment: location chips", () => {
  it("the day's location is preselected and nothing is posted (the database fills it)", () => {
    open([A, B]);
    expect(checked()).toEqual(["Unidade Sul"]);
    expect(posted()).toBeNull();
  });

  it("picking another location posts it", () => {
    open([A, B]);
    fireEvent.click(screen.getByText("Unidade Centro"));
    expect(checked()).toEqual(["Unidade Centro"]);
    expect(posted()).toBe(A.id);
  });

  it("one location (or the switch off): no chips, as before", () => {
    open([A]);
    expect(screen.queryAllByTestId("location-chip")).toHaveLength(0);
  });
});
