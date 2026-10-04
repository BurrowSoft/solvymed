import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 166 C: in "Todos", a new appointment / block asks for the doctor first
// (preselected from the chip filter) and is made for that doctor, with that
// doctor's procedures and currency.

vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions", () => ({ actForRow: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient", async () => {
  const { useRowPractice } = await import("@/components/RowPractice");
  return {
    BlockTimeButton: () => <span data-testid="block-for">{useRowPractice()}</span>,
    NewAppointmentButton: ({ currency, procedures }: { currency: string; procedures: { name: string }[] }) => (
      <span data-testid="new-for">{`${useRowPractice()}|${currency}|${procedures.map((p) => p.name).join(",")}`}</span>
    ),
  };
});

import { AllAddButtons } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/AllAddButtons";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ctx = (currency: string, proc: string) => ({ currency, pixKey: null, promptPayId: null, clinicName: "", clinicCity: "", procedures: [{ id: proc, name: proc, duration_minutes: 30, payment_type: "private" }] }) as never;
const doctors = [
  { tag: { id: A, name: "Dra. Ana", accent: null }, ctx: ctx("BRL", "Consulta") },
  { tag: { id: B, name: "Dr. Somchai", accent: "#7c3aed" }, ctx: ctx("THB", "Check-up") },
];
const show = (preselected: string | null) =>
  render(<NextIntlClientProvider locale="pt-BR" messages={pt}><AllAddButtons doctors={doctors} defaultDate="2026-10-09" preselected={preselected} /></NextIntlClientProvider>);

describe("Todos: new appointment / block", () => {
  it("asks for the doctor (preselected from the filter) and acts for them, with their procedures and currency", () => {
    show(B);
    expect(screen.getByText(pt.secretaryPractices.doctorField)).toBeInTheDocument();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(B);
    expect(screen.getByTestId("new-for")).toHaveTextContent(`${B}|THB|Check-up`);
    expect(screen.getByTestId("block-for")).toHaveTextContent(B);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: A } });
    expect(screen.getByTestId("new-for")).toHaveTextContent(`${A}|BRL|Consulta`);
    expect(screen.getByTestId("block-for")).toHaveTextContent(A);
  });

  it("no filter (or an unknown one): the first doctor", () => {
    show("33333333-3333-4333-8333-333333333333");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(A);
  });
});
