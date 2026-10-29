import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "fs";

vi.mock("@/lib/setupActions", () => ({ dismissOnboardingCard: vi.fn() }));
import { OnboardingCard } from "@/components/OnboardingCard";

const pt = JSON.parse(readFileSync("src/messages/pt-BR.json", "utf8").trimStart());

// #695 (WT1): the "connected" banner names the practice as every doctor's name is shown
// (a Thai title against the name, lib/doctorName).
describe("OnboardingCard: the practice's name", () => {
  it("a Thai title against the name", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><OnboardingCard kind="patient_connected" clinicName="พญ. ณัฐธิดา ใจดี" /></NextIntlClientProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Sua conta está conectada a พญ.ณัฐธิดา ใจดี.");
  });
  it("a clinic name stays as it is", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><OnboardingCard kind="patient_connected" clinicName="Clínica Bem Viver" /></NextIntlClientProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Sua conta está conectada a Clínica Bem Viver.");
  });
});
