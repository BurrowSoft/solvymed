import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 3e (#289 regression): Minhas Consultas refreshes every 60 s, which hands
// the card a new appointment object; the open reschedule dialog must keep
// the time the patient picked (it used to reload the slots and clear it).

const h = vi.hoisted(() => ({ slotLoads: 0 }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: async () => ({ data: {}, error: null }) }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: null }),
  declineProposal: async () => ({ error: null }),
  cancelMyRequest: async () => ({ error: null }),
  requestReschedule: async () => ({ error: null }),
  getAvailableSlotsForDate: async () => { h.slotLoads++; return [{ start: "10:00", end: "10:30" }, { start: "11:00", end: "11:30" }]; },
}));

import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const appt = () => ({
  id: "a-1", date: "2099-01-20", start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
  professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, scheduled_by: "professional", patient_note: null, status: "confirmed",
});
const ui = () => (
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <MyAppointmentsClient upcoming={[appt() as never]} past={[]} userEmail="p@x.co" myProfessionalId="doc-1" myProfessionalMeta={null} />
  </NextIntlClientProvider>
);

describe("the reschedule pick survives a refresh", () => {
  it("a new appointment object with the same values keeps the chosen time", async () => {
    const { rerender } = render(ui());
    fireEvent.click(await screen.findByTestId("reschedule-request-button"));
    fireEvent.click(await screen.findByRole("button", { name: /11:00/ }));
    const send = screen.getByRole("button", { name: pt.myAppointments.rescheduleSend });
    expect(send).not.toBeDisabled();
    const loads = h.slotLoads;
    rerender(ui()); // what router.refresh() does
    await new Promise((r) => setTimeout(r, 20));
    expect(h.slotLoads).toBe(loads);
    expect(screen.getByRole("button", { name: pt.myAppointments.rescheduleSend })).not.toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /11:00/ })).toHaveAttribute("aria-pressed", "true"));
  });
});
