import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { PcPageFrame } from "@/components/patientChannel/PcPageFrame";
import { PatientChannelTest } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelTest";
import { EMPTY_RULES } from "@/lib/patientChannel/rules";
import { toReadingHours } from "@/lib/patientChannel/readingHours";
import { SAMPLE_PAGE, samplePreview, sampleSubmit } from "@/lib/patientChannel/patientPage";

// web tester 2's www re-run of the launch polish (01, 10-27):
// 35 the patient's avatars drop a Thai title too ("หมอซ้อมใหญ่" → not "ห");
// (a) the doctor's test starts unanswered, like the patient's form (item 15);
// (b) the Horário tile keeps its time range on one line at 360 px.

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  acceptProposal: async () => ({ error: null }), declineProposal: async () => ({ error: null }), cancelMyRequest: async () => ({ error: null }),
  requestReschedule: async () => ({ error: null }), getAvailableSlotsForDate: async () => [],
}));
vi.mock("@/lib/setupActions", () => ({ dismissOnboardingCard: async () => ({ ok: true }) }));
vi.mock("@/app/[locale]/(site)/my-appointments/doctor-actions", () => ({ connectDoctor: vi.fn(), disconnectDoctor: vi.fn() }));

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

describe("35: the patient's avatars skip titles in any script", () => {
  it.each([
    ["หมอซ้อมใหญ่", "ซ"],
    ["นพ.สมชาย ใจดี", "สใ"],
    ["คุณหมอ วิภา", "ว"],
    ["Dra. Ana Souza", "AS"],
  ])("the channel page: %s → %s", (name, letters) => {
    render(<PcPageFrame look={null} doctorName={name} practiceLine="">{null}</PcPageFrame>);
    const avatar = screen.getByText(letters);
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
  });

  it("a blank name: '•', as in the app (cf)", () => {
    render(<PcPageFrame look={null} doctorName="  " practiceLine="">{null}</PcPageFrame>);
    expect(screen.getByText("•").getAttribute("aria-hidden")).toBe("true");
  });

  it("the booking page's avatar uses the same helper (not the name's first character)", () => {
    const src = readFileSync("src/app/[locale]/(site)/book/[professionalId]/BookingClient.tsx", "utf8");
    expect(src).toContain('{brandInitials(professionalName) || "•"}');
    expect(src).not.toContain("professionalName.charAt(0)");
  });
});

describe("(a) the doctor's test starts unanswered", () => {
  it("every question reads 'Escolha…' and adds nothing", () => {
    render(wrap(<PatientChannelTest rules={{ ...EMPTY_RULES, country: "BR" }} emergencyNumber="192" onBack={vi.fn()} />));
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects).toHaveLength(3);
    for (const s of selects) {
      expect(s.value).toBe("-1");
      expect(s.selectedOptions[0].textContent).toBe(pt.patientChannel.answers.choose);
    }
    expect(screen.getByTestId("pc-test-total").textContent).toBe("0");
  });
});

describe("(b) the Horário tile's time range never breaks", () => {
  it("the times sit in a no-wrap span after the days", async () => {
    const { PatientChannelFlow } = await import("@/components/patientChannel/PatientChannelFlow");
    const page = { ...SAMPLE_PAGE, readingHours: toReadingHours([{ days: [1, 2, 3, 4, 5], from: "08:00", to: "18:00" }]) };
    render(wrap(<PatientChannelFlow page={page} preview={samplePreview()} submit={sampleSubmit()} />));
    const times = screen.getByText("08:00–18:00");
    expect(times.className).toContain("whitespace-nowrap");
    expect(times.parentElement?.textContent).toMatch(/^seg\.?–sex\.? · 08:00–18:00$/);
  });
});
