import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";
import { consultTypeKey, PLAIN_CONSULTATION } from "@/lib/consultType";
import { ConsultTypeLabel } from "@/components/ConsultTypeLabel";

// Item 6.2 + the types shown raw: appointment types are the app's English
// keys ("Consultation", legacy "Consulta", …), shown in the reader's
// language; a plain consultation (no procedure) is a choice in the form.

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

describe("consult type labels", () => {
  it("maps the canonical keys (and the legacy Consulta)", () => {
    expect(consultTypeKey("Consultation")).toBe("consultation");
    expect(consultTypeKey("Consulta")).toBe("consultation");
    expect(consultTypeKey("Follow-up")).toBe("followUp");
    expect(consultTypeKey("Limpeza")).toBeNull();
  });

  it("shows them in the reader's language; a procedure's own name as written", () => {
    const { unmount } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ConsultTypeLabel value="Consultation" /> / <ConsultTypeLabel value="Limpeza" /></NextIntlClientProvider>);
    expect(document.body.textContent).toContain("Consulta / Limpeza");
    unmount();
    render(<NextIntlClientProvider locale="th" messages={th}><ConsultTypeLabel value="Consultation" /></NextIntlClientProvider>);
    expect(document.body.textContent).toContain("ตรวจทั่วไป");
  });
});

describe("New appointment: a plain consultation (6.2)", () => {
  it("is the first choice, stored as the Consultation key, 30 minutes", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <NewAppointmentButton defaultDate="2030-01-14" procedures={[{ id: "p1", name: "Limpeza", duration_minutes: 60, price: 200, payment_type: "private" } as never]} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText(pt.schedule.newAppt));
    const select = document.querySelector('select[name="consultation_type"]') as HTMLSelectElement;
    expect(select.options[0].value).toBe(PLAIN_CONSULTATION);
    expect(select.options[0].text).toBe("Consulta");
    fireEvent.change(select, { target: { value: PLAIN_CONSULTATION } });
    expect((document.querySelector('input[name="duration_minutes"]') as HTMLInputElement).value).toBe("30");
  });
});
