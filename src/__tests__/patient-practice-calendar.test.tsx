import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";
import { dateLocale, formatDateLabel } from "@/lib/dateLabels";

// Q4 (2 Oct; 76 found it in the app): on patient screens each appointment's
// dates follow THAT appointment's practice country (a BR clinic Gregorian,
// a TH clinic Buddhist); only the language follows the patient.

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
vi.mock("@/lib/setupActions", () => ({ dismissOnboardingCard: async () => ({ ok: true }) }));
vi.mock("@/app/[locale]/(site)/my-appointments/doctor-actions", () => ({ connectDoctor: vi.fn(), disconnectDoctor: vi.fn() }));

import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

const visit = (id: string, professional_id: string, professional_name: string) => ({
  id, date: "2099-01-10", start_time: "09:00:00", end_time: "09:30:00", status: "confirmed", consultation_type: "Consultation", type: "in-person",
  professional_id, proposed_date: null, proposed_start_time: null, proposed_end_time: null, patient_note: null, scheduled_by: "professional",
  professional_name, clinic_name: null,
});

describe("dates in the practice country's calendar", () => {
  it("the calendar is the practice's; the language stays the reader's", () => {
    expect(dateLocale("th")).toBe("th-TH-u-ca-buddhist");
    expect(dateLocale("th", "gregorian")).toBe("th-TH-u-ca-gregory");
    expect(dateLocale("en", "buddhist")).toBe("en-GB-u-ca-buddhist");
    expect(dateLocale("pt-BR")).toBe("pt-BR");
    const y = { year: "numeric" } as const;
    expect(formatDateLabel("pt-BR", "2099-01-10", y, "buddhist")).toContain("2642");
    expect(formatDateLabel("th", "2099-01-10", y, "gregorian")).toContain("2099");
  });

  it("two doctors in two countries: each card in its own practice's calendar", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[visit("a-br", "doc-br", "Dra. Ana"), visit("a-th", "doc-th", "Dr. Somchai")] as never} past={[]} userEmail="p@x.co"
          myProfessionalId="doc-br" myProfessionalMeta={null} practiceCountry="BR"
          practices={{ "doc-br": { country: "BR", tz: "America/Sao_Paulo" }, "doc-th": { country: "TH", tz: "Asia/Bangkok" } }} />
      </NextIntlClientProvider>,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("2099");
    expect(text).toContain("2642");
  });

  it("a Thai reader of a Brazilian clinic: Thai words, Gregorian year", () => {
    render(
      <NextIntlClientProvider locale="th" messages={th}>
        <MyAppointmentsClient upcoming={[visit("a-br", "doc-br", "Dra. Ana")] as never} past={[]} userEmail="p@x.co"
          myProfessionalId="doc-br" myProfessionalMeta={null} practiceCountry="BR"
          practices={{ "doc-br": { country: "BR", tz: "America/Sao_Paulo" } }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByText(/2099/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("2642");
  });
});
