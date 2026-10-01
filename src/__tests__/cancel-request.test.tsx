import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { pushText } from "@/lib/pushText";

// The patient's "Cancelar pedido" (38/e7, 152): only on a pending request
// ('tentative', not lapsed); confirm first; the clinic gets "Pedido
// cancelado" (never free text); a refusal says to talk to the clinic.

const h = vi.hoisted(() => ({ result: { error: null as string | null }, calls: [] as string[] }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: null }),
  declineProposal: async () => ({ error: null }),
  cancelMyRequest: async (id: string) => { h.calls.push(id); return h.result; },
  requestReschedule: async () => ({ error: null }),
  getAvailableSlotsForDate: async () => [],
}));

import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const base = {
  start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
  professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, patient_note: null, scheduled_by: "patient",
};
function show(appts: Record<string, unknown>[]) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <MyAppointmentsClient upcoming={appts as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => { h.result = { error: null }; h.calls = []; });

describe("Cancelar pedido", () => {
  it("only on a pending, future request", async () => {
    show([
      { ...base, id: "req", date: "2099-01-10", status: "tentative" },
      { ...base, id: "old", date: "2020-01-10", status: "tentative" },
      { ...base, id: "conf", date: "2099-01-10", status: "confirmed" },
    ]);
    await waitFor(() => expect(screen.getAllByTestId("cancel-request-button")).toHaveLength(1));
  });

  it("asks first; Manter pedido keeps it; Cancelar pedido cancels and says so", async () => {
    show([{ ...base, id: "req", date: "2099-01-10", status: "tentative" }]);
    fireEvent.click(await screen.findByTestId("cancel-request-button"));
    expect(screen.getByText("Cancelar este pedido?")).toBeInTheDocument();
    expect(screen.getByText("A clínica será avisada e o horário fica livre.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Manter pedido"));
    expect(h.calls).toEqual([]);
    fireEvent.click(screen.getByTestId("cancel-request-button"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pedido cancelado.");
    expect(h.calls).toEqual(["req"]);
    expect(screen.queryByTestId("cancel-request-button")).toBeNull();
  });

  it("refused (the clinic already answered) → talk to the clinic", async () => {
    h.result = { error: "not_cancellable" };
    show([{ ...base, id: "req", date: "2099-01-10", status: "tentative" }]);
    fireEvent.click(await screen.findByTestId("cancel-request-button"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Para cancelar, fale com a clínica.");
  });

  it("copy in en / th", () => {
    expect(en.myAppointments.cancelRequest).toBe("Cancel request");
    expect(th.myAppointments.requestCancelledToast).toBe("ยกเลิกคำขอแล้ว");
  });
});

describe("the clinic's push", () => {
  it("names the patient and the time, never free text", () => {
    expect(pushText("pt-BR", "requestCancelled", { name: "Ana", when: "10/01 09:00" })).toEqual({ title: "Pedido cancelado", body: "Ana cancelou o pedido de 10/01 09:00." });
    expect(pushText("en", "requestCancelled", { name: "Ana", when: "Jan 10 09:00" }).body).toBe("Ana cancelled their request for Jan 10 09:00.");
    expect(pushText("th", "requestCancelled", { name: "Ana", when: "10 ม.ค. 09:00" })).toEqual({ title: "ยกเลิกคำขอ", body: "Ana ยกเลิกคำขอนัดวันที่ 10 ม.ค. 09:00" });
  });
});
