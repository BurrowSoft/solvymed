import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { readingHoursLines, toReadingHours } from "@/lib/patientChannel/readingHours";
import { SAMPLE_PAGE, samplePreview, sampleSubmit } from "@/lib/patientChannel/patientPage";

// Patient Channel launch polish, section B, the patient side (specs/patient-channel-launch-polish.md):
// 20 the doctor's real reading hours, 21 "Substituiu a mensagem anterior.", 22 the reason chips,
// and web tester 2's one-doctor card without a display name.

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

const { PatientChannelFlow } = await import("@/components/patientChannel/PatientChannelFlow");
const { MyAppointmentsClient } = await import("@/app/[locale]/(site)/my-appointments/MyAppointmentsClient");

const P = pt.patientChannel.patient;
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

describe("20: the reading hours", () => {
  it("rows checked; consecutive days as a range; each row its days and times", () => {
    const rows = toReadingHours([{ days: [1, 2, 3, 4, 5], from: "08:00", to: "18:00" }, { days: [6], from: "09:00", to: "12:00" }, { days: [], from: "08:00", to: "09:00" }, { days: [1], from: "8h", to: "9" }, null]);
    expect(rows).toHaveLength(2);
    const lines = readingHoursLines(rows, "pt-BR");
    expect(lines[0]).toMatch(/^seg\.?–sex\.? · 08:00–18:00$/);
    expect(lines[1]).toMatch(/^sáb\.? · 09:00–12:00$/);
    expect(readingHoursLines(toReadingHours([{ days: [1, 3], from: "08:00", to: "10:00" }]), "pt-BR")[0]).toMatch(/^seg\.?, qua\.? · 08:00–10:00$/);
  });
  it("the Horário tile shows them and the note; without hours, the general line", () => {
    const page = { ...SAMPLE_PAGE, readingHours: toReadingHours([{ days: [1, 2, 3, 4, 5], from: "08:00", to: "18:00" }]), readingNote: "Respondo à tarde." };
    const { unmount } = render(wrap(<PatientChannelFlow page={page} preview={samplePreview()} submit={sampleSubmit()} />));
    const tile = screen.getByTestId("pc-hours");
    expect(tile).toHaveTextContent(/08:00–18:00/);
    expect(tile).toHaveTextContent("Respondo à tarde.");
    expect(tile).not.toHaveTextContent(P.hoursLabel);
    unmount();
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} />));
    expect(screen.getByTestId("pc-hours")).toHaveTextContent(P.hoursLabel);
  });
});

describe("21 / 22: the flow", () => {
  it("a send that replaced the open request says so; a plain send doesn't", async () => {
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} />));
    const toForm = () => { fireEvent.click(screen.getByTestId("pc-start")); fireEvent.click(screen.getByTestId("pc-faq-continue")); fireEvent.click(screen.getByTestId("pc-reason-adm")); };
    toForm();
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toBeInTheDocument());
    expect(screen.queryByTestId("pc-sent-replaced")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: P.again }));
    toForm();
    fireEvent.click(screen.getByTestId("pc-send"));
    fireEvent.click(await screen.findByTestId("pc-replace-yes"));
    expect(await screen.findByTestId("pc-sent-replaced")).toHaveTextContent(P.replacedPrevious);
  });
  it("the reason chip is capped and cut (no uppercase full name pushing the title)", () => {
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} />));
    fireEvent.click(screen.getByTestId("pc-start"));
    fireEvent.click(screen.getByTestId("pc-faq-continue"));
    const chip = screen.getByTestId("pc-reason-to-efe");
    expect(chip.className).toMatch(/\btruncate\b/);
    expect(chip.className).toMatch(/max-w-\[45%\]/);
    expect(chip.className).not.toMatch(/\buppercase\b|\bshrink-0\b/);
  });
});

describe("the one-doctor card without a display name (web tester 2)", () => {
  const card = (meta: { name: string; specialty: string; clinicName?: string } | null) =>
    render(wrap(<MyAppointmentsClient upcoming={[]} past={[]} userEmail="p@x.co" myProfessionalId="doc-1" myProfessionalMeta={meta} />));
  it("no name: the card still shows, headed by the clinic's name, with Desconectar", () => {
    card({ name: "", specialty: "", clinicName: "Clínica Sol" });
    const c = screen.getByTestId("your-doctor");
    expect(within(c).getByTestId("your-doctor-name")).toHaveTextContent("Clínica Sol");
    expect(c).toHaveTextContent(pt.patientDoctors.disconnect);
  });
  it("no name and no clinic: only \"Seu médico\", still with Desconectar", () => {
    card({ name: "", specialty: "", clinicName: "" });
    const c = screen.getByTestId("your-doctor");
    expect(within(c).queryByTestId("your-doctor-name")).toBeNull();
    expect(c).toHaveTextContent(pt.myAppointments.yourDoctor);
    expect(c).toHaveTextContent(pt.patientDoctors.disconnect);
  });
  it("a named doctor is unchanged", () => {
    card({ name: "Dra. Ana Souza", specialty: "", clinicName: "Clínica Sol" });
    expect(screen.getByTestId("your-doctor-name")).toHaveTextContent("Dra. Ana Souza");
  });
});
