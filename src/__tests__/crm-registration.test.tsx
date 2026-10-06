import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Settings → Profile for Brazilian practices (cf): the app's Registrations
// form, CRM number + state (else another council), saved as one line in the
// app's format; a saved value goes back unchanged until a field is edited.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => ({
  updateProfile: vi.fn(), updateClinic: vi.fn(), updateWorkingHours: vi.fn(), createProcedure: vi.fn(), toggleProcedure: vi.fn(),
  deleteProcedure: vi.fn(), updateSchedulingRules: vi.fn(), unblockPatient: vi.fn(), generatePublicInviteCode: vi.fn(),
}));

import { ProfileForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { councilRegistration, parseCouncilRegistration } from "@/lib/registration";

const t = pt.settings;
const show = (registration?: string) => render(
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <ProfileForm fullName="Ana" registration={registration} country="BR" />
  </NextIntlClientProvider>,
);
const posted = (c: HTMLElement) => (c.querySelector("input[name=professional_registration]") as HTMLInputElement).value;

describe("the app's registration format (lib/registration)", () => {
  it("CRM first, with the state in capitals; else another council; else nothing", () => {
    expect(councilRegistration({ crm: " 12345 ", crmState: "sp" })).toBe("CRM 12345/SP");
    expect(councilRegistration({ crm: "12345" })).toBe("CRM 12345");
    expect(councilRegistration({ additionalCouncil: "cro", additionalCouncilNumber: "999" })).toBe("CRO 999");
    expect(councilRegistration({ additionalCouncil: "CRO" })).toBeNull();
    expect(councilRegistration({})).toBeNull();
  });

  it("a saved line back into the fields", () => {
    expect(parseCouncilRegistration("CRM 12345/sp")).toEqual({ crm: "12345", crmState: "SP" });
    expect(parseCouncilRegistration("CRM 12345")).toEqual({ crm: "12345", crmState: "" });
    expect(parseCouncilRegistration("CRO 999")).toEqual({ additionalCouncil: "CRO", additionalCouncilNumber: "999" });
    // A bare number is a CRM without a state (c6), so a partial edit keeps it.
    expect(parseCouncilRegistration("12345")).toEqual({ crm: "12345", crmState: "" });
    expect(parseCouncilRegistration("12.345")).toEqual({ additionalCouncilNumber: "12.345" });
    expect(parseCouncilRegistration(null)).toEqual({});
  });
});

describe("Settings → Profile, Brazil", () => {
  it("a saved CRM fills the number and the state", () => {
    show("CRM 12345/RJ");
    expect(screen.getByLabelText(t.regNumber, { selector: "input[inputmode=numeric]" })).toHaveValue("12345");
    expect(screen.getByLabelText(t.regState)).toHaveValue("RJ");
  });

  it("the state picker has the 27 UFs; choosing one saves \"CRM {n}/{UF}\"", () => {
    const { container } = show();
    const state = screen.getByLabelText(t.regState) as HTMLSelectElement;
    expect(state.options).toHaveLength(28);
    expect(state.options[0]).toHaveTextContent(t.regSelectState);
    fireEvent.change(screen.getByLabelText(t.regNumber, { selector: "input[inputmode=numeric]" }), { target: { value: "54321" } });
    fireEvent.change(state, { target: { value: "SP" } });
    expect(posted(container)).toBe("CRM 54321/SP");
  });

  it("another council when there's no CRM", () => {
    const { container } = show();
    fireEvent.change(screen.getByLabelText(t.regCouncil), { target: { value: "cro" } });
    fireEvent.change(screen.getByPlaceholderText(t.regNumberPlaceholder), { target: { value: "777" } });
    expect(posted(container)).toBe("CRO 777");
  });

  it("an old free-text value goes back unchanged until a field is edited (cf)", () => {
    const { container } = show("crm 12345 sp");
    expect(posted(container)).toBe("crm 12345 sp");
  });

  it("clearing the fields clears the registration", () => {
    const { container } = show("CRM 1/SP");
    fireEvent.change(screen.getByLabelText(t.regNumber, { selector: "input[inputmode=numeric]" }), { target: { value: "" } });
    expect(posted(container)).toBe("");
  });
});
