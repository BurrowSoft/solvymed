import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 154 (e7): a patient's reschedule request that lapsed unanswered is settled
// by the server (the visit stays; reschedule_lapsed_at set); while the visit
// is ahead, Minhas Consultas says so, with the normal actions. Plus 3e's nit:
// a refusal answered by the refresh isn't printed twice.

const h = vi.hoisted(() => ({ cancelResult: { error: null as string | null } }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: null }),
  declineProposal: async () => ({ error: null }),
  cancelMyRequest: async () => h.cancelResult,
  requestReschedule: async () => ({ error: null }),
  getAvailableSlotsForDate: async () => [],
}));

import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const base = {
  start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
  professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, patient_note: null, scheduled_by: null,
};
const ui = (appts: Record<string, unknown>[]) => (
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <MyAppointmentsClient upcoming={appts as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
  </NextIntlClientProvider>
);

describe("Seu pedido de remarcação expirou (154)", () => {
  it("on a visit still ahead, with Solicitar remarcação", async () => {
    render(ui([{ ...base, id: "a", date: "2099-01-10", status: "confirmed", reschedule_lapsed_at: "2099-01-01T12:00:00Z" }]));
    expect(await screen.findByTestId("reschedule-lapsed")).toHaveTextContent("Seu pedido de remarcação expirou.");
    expect(screen.getByTestId("reschedule-request-button")).toBeInTheDocument();
  });

  it("not without the marker, and not once the visit has passed", async () => {
    render(ui([
      { ...base, id: "a", date: "2099-01-10", status: "confirmed", reschedule_lapsed_at: null },
      { ...base, id: "b", date: "2020-01-10", status: "confirmed", reschedule_lapsed_at: "2020-01-09T12:00:00Z" },
    ]));
    await screen.findAllByTestId("appointment-card");
    expect(screen.queryByTestId("reschedule-lapsed")).toBeNull();
  });

  it("en / th", () => {
    expect(en.myAppointments.rescheduleLapsed).toBe("Your reschedule request expired.");
    expect(th.myAppointments.rescheduleLapsed).toBe("คำขอเลื่อนนัดของคุณหมดอายุแล้ว");
  });
});

describe("a refused cancel isn't said twice (3e)", () => {
  it("the error goes once the refresh shows the clinic's answer", async () => {
    h.cancelResult = { error: "not_cancellable" };
    const req = { ...base, id: "r", date: "2099-01-10", status: "tentative" };
    const { rerender } = render(ui([req]));
    fireEvent.click(await screen.findByTestId("cancel-request-button"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Para cancelar, fale com a clínica.");
    rerender(ui([{ ...req, status: "confirmed" }]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("Para cancelar, fale com a clínica.")).toHaveLength(1);
  });
});
