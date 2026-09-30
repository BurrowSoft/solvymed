import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// React #418 on the patient page: "Paciente desde" was formatted in the
// runtime's time zone (the server's UTC vs the browser's), so near midnight
// the two rendered different days. It now uses the clinic's time zone.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";

// 01:30 UTC on 1 Oct = 22:30 on 30 Sep in São Paulo.
const patient = { id: "p1", full_name: "Ana", created_at: "2026-10-01T01:30:00Z" };
const page = (timeZone: string) => render(
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone={timeZone} />
  </NextIntlClientProvider>,
);

describe("patient page dates follow the clinic's time zone", () => {
  it("the same day wherever it renders", () => {
    const r = page("America/Sao_Paulo");
    expect(screen.getByText("30 de setembro de 2026")).toBeInTheDocument();
    r.unmount();
    page("Asia/Bangkok");
    expect(screen.getByText("1 de outubro de 2026")).toBeInTheDocument();
  });
});
