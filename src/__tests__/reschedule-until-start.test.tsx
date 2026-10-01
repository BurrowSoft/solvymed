import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// e7: a reschedule can be asked only until the visit STARTS, on the clinic's
// clock (it used to stay until the visit ended, on the browser's clock).

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: null }),
  declineProposal: async () => ({ error: null }),
  cancelMyRequest: async () => ({ error: null }),
  requestReschedule: async () => ({ error: null }),
  getAvailableSlotsForDate: async () => [],
}));

import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const visit = (id: string, start: string, end: string) => ({
  id, date: "2030-01-15", start_time: start, end_time: end, status: "confirmed", consultation_type: "Consulta", type: "in-person",
  professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, patient_note: null, scheduled_by: "professional",
});

afterEach(() => vi.useRealTimers());

describe("Solicitar remarcação until the visit starts", () => {
  it("09:10 in São Paulo: the 09:00 visit (still running) has none; the 09:30 one has it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-15T12:10:00Z"));
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[visit("a", "09:00:00", "09:30:00"), visit("b", "09:30:00", "10:00:00")] as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} clinicTz="America/Sao_Paulo" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findAllByTestId("reschedule-request-button")).toHaveLength(1);
  });

  it("the clinic's clock decides: 09:10 São Paulo is 19:10 in Bangkok, so both have started there", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-15T12:10:00Z"));
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[visit("a", "18:00:00", "18:30:00"), visit("b", "19:30:00", "20:00:00")] as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} clinicTz="Asia/Bangkok" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findAllByTestId("reschedule-request-button")).toHaveLength(1);
  });
});
