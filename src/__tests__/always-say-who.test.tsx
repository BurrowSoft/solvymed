import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { whoLine } from "@/lib/whoLine";

// Vitor, build 25 item 4 (158): the patient always sees with whom: the
// doctor + clinic on each visit, "Seu médico", and "Marcar consulta com …".

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

const visit = {
  id: "a-1", date: "2099-01-10", start_time: "09:00:00", end_time: "09:30:00", status: "confirmed", consultation_type: "Consultation", type: "in-person",
  professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, patient_note: null, scheduled_by: "professional",
  professional_name: "Dra. Ana Souza", clinic_name: "Clínica Sol",
};

describe("whoLine", () => {
  it("doctor · clinic; one alone; never the same name twice", () => {
    expect(whoLine("Dra. Ana Souza", "Clínica Sol")).toBe("Dra. Ana Souza · Clínica Sol");
    expect(whoLine("Dra. Ana Souza", null)).toBe("Dra. Ana Souza");
    expect(whoLine(null, " Clínica Sol ")).toBe("Clínica Sol");
    expect(whoLine("Ana Souza", "ana souza")).toBe("Ana Souza");
    expect(whoLine(null, "")).toBe("");
  });
});

describe("Minhas Consultas says who", () => {
  it("each visit names its doctor and clinic; the book buttons name the doctor; 'Seu médico'", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[visit as never]} past={[]} userEmail="p@x.co" myProfessionalId="doc-1"
          myProfessionalMeta={{ name: "Dra. Ana Souza", specialty: "Dermatologia", clinicName: "Clínica Sol" }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("appointment-who")).toHaveTextContent("Dra. Ana Souza · Clínica Sol");
    expect(screen.getByTestId("your-doctor")).toHaveTextContent("Seu médico");
    expect(screen.getByTestId("your-doctor")).toHaveTextContent("Dermatologia · Clínica Sol");
    expect(screen.getAllByText("Marcar consulta com Dra. Ana Souza").length).toBeGreaterThan(0);
    expect(screen.queryByText("Agendar consulta")).toBeNull();
  });

  it("before 158 (no names): nothing extra, the plain book label", () => {
    const { professional_name: _p, clinic_name: _c, ...old } = visit;
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[old as never]} past={[]} userEmail="p@x.co" myProfessionalId="doc-1" myProfessionalMeta={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("appointment-who")).toBeNull();
    expect(screen.queryByTestId("your-doctor")).toBeNull();
  });

  it("copy in en / th (e7, as the app)", () => {
    expect(en.myAppointments.bookWith).toBe("Book with {doctor}");
    expect(th.myAppointments.bookWith).toBe("นัดหมายกับ {doctor}");
    expect(pt.schedule.requestedLabel).toBe("Novo horário pedido: {date} · {time}");
    expect(th.myAppointments.yourDoctor).toBe("แพทย์ของคุณ");
  });
});
