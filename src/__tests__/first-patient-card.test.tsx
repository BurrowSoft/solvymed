import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Activation B1: a practice with no patient gets one clear next step on the home, hidden
// while the guided tour is on screen.

const h = vi.hoisted(() => ({ running: false, touring: false, track: vi.fn() }));
vi.mock("@/components/tour/TourProvider", () => ({ useTour: () => ({ running: h.running, touring: h.touring }) }));
vi.mock("@/lib/track", () => ({ track: h.track }));

import { FirstPatientCard } from "@/components/FirstPatientCard";

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

describe("Adicione seu primeiro paciente", () => {
  it("adds a patient (the form) or books the first appointment, tracked", () => {
    h.running = false;
    h.touring = false;
    render(wrap(<FirstPatientCard prefix="/pt-BR" />));
    expect(screen.getByRole("heading", { name: pt.firstPatient.title })).toBeInTheDocument();
    const add = screen.getByRole("link", { name: pt.firstPatient.add });
    expect(add).toHaveAttribute("href", "/pt-BR/dashboard/patients?new=1");
    expect(screen.getByRole("link", { name: pt.firstPatient.book })).toHaveAttribute("href", "/pt-BR/dashboard/schedule");
    fireEvent.click(add);
    expect(h.track).toHaveBeenCalledWith("first_patient_card", { action: "add" });
  });

  it("waits while a tour's spotlight is on screen (the page must not move under it)", () => {
    h.running = true;
    h.touring = true;
    render(wrap(<FirstPatientCard prefix="" />));
    expect(screen.queryByTestId("first-patient-card")).toBeNull();
  });

  // 01, 10-26: under the Novidades / Meet SolvyAI popups it is already there (web tester 1:
  // at 1366 a new doctor saw no card behind the SolvyAI intro, desktop-only).
  it("0 patients + a popup open (Novidades / Meet SolvyAI): the card is in the page", () => {
    h.running = true;
    h.touring = false;
    render(wrap(<FirstPatientCard prefix="" />));
    expect(screen.getByTestId("first-patient-card")).toBeInTheDocument();
  });

  it("the home shows it to doctors only, with 0 patients and a count it could read", () => {
    const page = readFileSync(resolve(__dirname, "../app/[locale]/(site)/dashboard/(gated)/page.tsx"), "utf8");
    expect(page).toContain("{!isSecretary && !isDemo && !patientCountResult.error && patientCount === 0 && <FirstPatientCard prefix={prefix} />}");
    // Not in the demo (01, B1), with no feature flag (it works with every flag off).
    const cardLine = page.split("\n").find((l) => l.includes("<FirstPatientCard")) ?? "";
    expect(cardLine).not.toContain("liveFeatures");
  });

  it("every locale has the card's strings", () => {
    const dir = resolve(__dirname, "../messages");
    for (const l of ["en", "pt-BR", "th", "es", "fr", "de", "it", "ar", "id", "ja", "ko", "ru", "vi", "zh", "zh-TW"]) {
      const m = JSON.parse(readFileSync(resolve(dir, `${l}.json`), "utf8").trimStart());
      expect(Object.keys(m.firstPatient).sort(), l).toEqual(["add", "body", "book", "title"]);
    }
  });
});
