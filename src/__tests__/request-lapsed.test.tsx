import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// e7 (app #225 parity): a request or proposal whose time has passed shows
// "Não confirmado" with no actions; the server's refusal of a past proposal
// (38) reads "Este horário já passou…".

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: "proposed_time_expired" }),
  declineProposal: async () => ({ error: null }),
  requestReschedule: async () => ({ error: null }),
  getAvailableSlotsForDate: async () => [],
}));

import { MyAppointmentsClient, requestLapsed } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const base = {
  start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
  professional_id: "doc-1", proposed_start_time: null, proposed_end_time: null, patient_note: null,
};
function show(appts: Record<string, unknown>[]) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <MyAppointmentsClient upcoming={appts as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
    </NextIntlClientProvider>,
  );
}

describe("requestLapsed (the clinic's clock)", () => {
  const now = new Date("2030-01-15T12:00:00Z"); // 09:00 in São Paulo
  it("an earlier day, or today at/before now, has passed", () => {
    expect(requestLapsed("2030-01-14", "18:00", now, "America/Sao_Paulo")).toBe(true);
    expect(requestLapsed("2030-01-15", "09:00", now, "America/Sao_Paulo")).toBe(true);
    expect(requestLapsed("2030-01-15", "09:15", now, "America/Sao_Paulo")).toBe(false);
    // Bangkok is already 19:00
    expect(requestLapsed("2030-01-15", "18:00", now, "Asia/Bangkok")).toBe(true);
  });
});

describe("a past request or proposal", () => {
  it("Não confirmado, no Aceitar/Recusar; a future proposal keeps them", async () => {
    show([
      { ...base, id: "old-req", date: "2020-01-10", status: "tentative", scheduled_by: "patient", proposed_date: null },
      { ...base, id: "old-prop", date: "2020-01-10", status: "proposal", scheduled_by: "professional", proposed_date: "2020-01-11", proposed_start_time: "10:00:00", proposed_end_time: "10:30:00" },
    ]);
    await waitFor(() => expect(screen.getAllByText("Não confirmado")).toHaveLength(2));
    expect(screen.queryByText("Aceitar")).toBeNull();
    expect(screen.queryByText("Recusar")).toBeNull();
  });

  it("a reschedule the patient asked for keeps its badge: the booking still stands (9a)", async () => {
    show([{ ...base, id: "r", date: "2099-01-10", status: "proposal", scheduled_by: "patient", proposed_date: "2020-01-11", proposed_start_time: "10:00:00", proposed_end_time: "10:30:00" }]);
    expect(await screen.findByText("Remarcação pendente")).toBeInTheDocument();
    expect(screen.queryByText("Não confirmado")).toBeNull();
  });

  it("a future proposal keeps Aceitar; a refusal for a passed time says so", async () => {
    show([{ ...base, id: "p", date: "2099-01-10", status: "proposal", scheduled_by: "professional", proposed_date: "2099-01-11", proposed_start_time: "10:00:00", proposed_end_time: "10:30:00" }]);
    const accept = await screen.findByText("Aceitar");
    accept.click();
    expect(await screen.findByRole("alert")).toHaveTextContent("Este horário já passou. Peça um novo horário à clínica.");
  });

  it("copy in en / th", () => {
    expect(en.myAppointments.statusNotConfirmed).toBe("Not confirmed");
    expect(th.myAppointments.statusNotConfirmed).toBe("ไม่ได้รับการยืนยัน");
    expect(th.myAppointments.proposalPassed).toBe("เวลานี้ผ่านไปแล้ว กรุณาขอเวลาใหม่จากคลินิก");
  });
});
