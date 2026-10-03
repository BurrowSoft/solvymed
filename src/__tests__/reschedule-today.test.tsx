import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Item 22: a patient's reschedule offers TODAY's remaining times on the
// clinic's clock (30 days, a month calendar, a grid, the chosen time); a
// confirmed appointment says how to cancel (e7).

const h = vi.hoisted(() => ({ tz: "America/Manaus" as string | null }));
const HOURS = { mon: { enabled: true, start: "08:00", end: "18:00" }, tue: { enabled: true, start: "08:00", end: "18:00" }, wed: { enabled: true, start: "08:00", end: "18:00" }, thu: { enabled: true, start: "08:00", end: "18:00" }, fri: { enabled: true, start: "08:00", end: "18:00" }, sat: { enabled: true, start: "08:00", end: "18:00" }, sun: { enabled: true, start: "08:00", end: "18:00" } };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    q.maybeSingle = async () => ({ data: { country: "BR", time_zone: h.tz }, error: null });
    return {
      auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
      rpc: (fn: string) => {
        if (fn === "get_professional_public_info") return q;
        if (fn === "get_professional_working_hours") return Promise.resolve({ data: HOURS, error: null });
        return Promise.resolve({ data: [], error: null });
      },
    };
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: async () => ({ data: HOURS, error: null }) }),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { getAvailableSlotsForDate } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";
import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 2030-01-15 14:10 UTC = 10:10 in Manaus (UTC−4).
  vi.setSystemTime(new Date(Date.UTC(2030, 0, 15, 14, 10)));
  h.tz = "America/Manaus";
});
afterEach(() => { vi.useRealTimers(); });

describe("getAvailableSlotsForDate on the clinic's clock", () => {
  it("today: only the times still ahead in the clinic's zone", async () => {
    const slots = await getAvailableSlotsForDate("doc-1", "2030-01-15", 30);
    expect(slots[0].start).toBe("10:30");
    expect(slots.every((s) => s.start > "10:10")).toBe(true);
  });

  it("a day already past offers nothing; tomorrow is whole", async () => {
    expect(await getAvailableSlotsForDate("doc-1", "2030-01-14", 30)).toEqual([]);
    expect((await getAvailableSlotsForDate("doc-1", "2030-01-16", 30))[0].start).toBe("08:00");
  });

  it("no time_zone (before 128): the country's zone", async () => {
    h.tz = null; // BR → São Paulo (UTC−3): 11:10
    const slots = await getAvailableSlotsForDate("doc-1", "2030-01-15", 30);
    expect(slots[0].start).toBe("11:30");
  });
});

describe("the patient's confirmed appointment", () => {
  const appt = {
    id: "a-1", date: "2030-01-20", start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
    professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, scheduled_by: "professional", patient_note: null, status: "confirmed",
  };
  const show = () =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[appt as never]} past={[]} userEmail="p@x.co" myProfessionalId="doc-1" myProfessionalMeta={null} clinicTz="America/Manaus" practiceCountry="BR" />
      </NextIntlClientProvider>,
    );

  it("says how to cancel, and reschedule is \"Solicitar remarcação\"", () => {
    show();
    expect(screen.getByTestId("cancel-hint")).toHaveTextContent("Para cancelar, fale com a clínica.");
    expect(screen.getByTestId("reschedule-request-button")).toHaveTextContent("Solicitar remarcação");
  });

  it("the reschedule dialog opens on a month calendar starting today", async () => {
    show();
    fireEvent.click(screen.getByTestId("reschedule-request-button"));
    await waitFor(() => expect(screen.getByTestId("month-calendar")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "14" })).toBeDisabled();
  });
});
