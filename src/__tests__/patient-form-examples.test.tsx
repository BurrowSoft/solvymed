import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewPatientButton } from "@/app/[locale]/(site)/dashboard/(gated)/patients/PatientsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/patients",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  // Keys come back as "namespace.key"; the neutral phone text is real.
  useTranslations: (ns: string) => (key: string) => (ns === "countryExamples" && key === "phone" ? "Phone number" : `${ns}.${key}`),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => ({ createPatient: vi.fn(), restorePatient: vi.fn() }));
vi.mock("@/lib/dropQueryParam", () => ({ dropQueryParam: vi.fn() }));

// UX: the phone examples follow the practice country (never "+55" for all);
// the other placeholders come from the locale files.
describe("the new-patient form's examples", () => {
  const phones = () => [document.querySelector<HTMLInputElement>("input[name=phone]")!.placeholder, document.querySelector<HTMLInputElement>("input[name=emergency_phone]")!.placeholder];

  it("BR, TH and Other practices", () => {
    const br = render(<NewPatientButton locale="en" autoOpen idKind="BR" />);
    expect(phones()).toEqual(["+55 (11) 99999-9999", "+55 (11) 99999-9999"]);
    br.unmount();
    const th = render(<NewPatientButton locale="en" autoOpen idKind="TH" />);
    expect(phones()).toEqual(["+66 81 234 5678", "+66 81 234 5678"]);
    th.unmount();
    render(<NewPatientButton locale="en" autoOpen idKind="OTHER" />);
    expect(phones()).toEqual(["Phone number", "Phone number"]);
  });

  it("the name and profession examples are translated", () => {
    render(<NewPatientButton locale="en" autoOpen idKind="BR" />);
    expect(screen.getByPlaceholderText("patients.fullNamePlaceholder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("patients.professionPlaceholder")).toBeInTheDocument();
  });
});
