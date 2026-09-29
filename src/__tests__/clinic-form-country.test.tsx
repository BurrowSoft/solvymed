import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Settings → Clinic follows the practice country (the app's rule, UX): the
// state label and the sample placeholders.

vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => ({}));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

import { ClinicForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";

const show = (country: string) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <ClinicForm data={{}} country={country} showPix={country === "BR"} showPromptPay={country === "TH"} />
    </NextIntlClientProvider>,
  );
const input = (name: string, c: HTMLElement) => c.querySelector(`input[name="${name}"]`) as HTMLInputElement;

describe("ClinicForm by practice country", () => {
  it("Brazil: Estado and the Brazilian samples", () => {
    const { container } = show("BR");
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(input("clinic_state", container).placeholder).toBe("SP");
    expect(input("clinic_phone", container).placeholder).toBe("(11) 3000-0000");
  });

  it("Thailand: Província, no Brazilian samples", () => {
    const { container } = show("TH");
    expect(screen.getByText("Província")).toBeInTheDocument();
    expect(input("clinic_state", container).placeholder).toBe("");
    expect(input("clinic_city", container).placeholder).toBe("Bangkok");
    expect(input("clinic_phone", container).placeholder).not.toContain("(11)");
  });

  it("elsewhere: Estado ou província and a country-code phone hint", () => {
    const { container } = show("US");
    expect(screen.getByText("Estado ou província")).toBeInTheDocument();
    expect(input("clinic_phone", container).placeholder).toBe("+ código do país e número");
    expect(input("clinic_city", container).placeholder).toBe("");
    expect(input("clinic_website", container).placeholder).toBe("www.example.com");
  });
});
