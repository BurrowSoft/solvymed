import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.9.0 (offline guard PR2-0): Settings' Profile / Working hours / Scheduling
// rules said "Salvo!" even when the save failed; the clinics forms lost what
// was typed on a failed save (React 19 resets a <form action> afterwards).

const settings = vi.hoisted(() => ({
  updateProfile: vi.fn(), updateWorkingHours: vi.fn(), updateSchedulingRules: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => settings);
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

const clinics = vi.hoisted(() => ({ addClinic: vi.fn(), updateClinic: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/clinics/actions", () => ({
  ...clinics, deleteClinic: vi.fn(), updateClinicLocation: vi.fn(), locateClinicCity: vi.fn(), makePrimaryClinic: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { ProfileForm, SchedulingRulesForm, WorkingHoursForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { ClinicsClient } from "@/app/[locale]/(site)/dashboard/(gated)/clinics/ClinicsClient";
import { savedOk } from "@/lib/savedOk";

const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>);
const SAVED = pt.settings.saved;
const FAILED = pt.settings.saveFailed;

afterEach(() => vi.clearAllMocks());

describe("savedOk", () => {
  it("only an answer without an error is saved", async () => {
    expect(await savedOk(async () => ({ success: true }))).toBe(true);
    expect(await savedOk(async () => undefined)).toBe(true);
    expect(await savedOk(async () => ({ error: "Unauthorized" }))).toBe(false);
    expect(await savedOk(async () => { throw new TypeError("Failed to fetch"); })).toBe(false);
  });
});

describe("Settings forms say Salvo! only when saved", () => {
  const forms = [
    ["Profile", settings.updateProfile, () => <ProfileForm fullName="Dra Ana" country="BR" />],
    ["Working hours", settings.updateWorkingHours, () => <WorkingHoursForm workingHours={null} country="BR" />],
    ["Scheduling rules", settings.updateSchedulingRules, () => <SchedulingRulesForm maxConcurrent={1} />],
  ] as const;

  for (const [name, action, ui] of forms) {
    it(`${name}: a returned error, then no answer, then a save`, async () => {
      wrap(ui());
      const submit = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: pt.settings.save })); });

      action.mockResolvedValueOnce({ error: "permission denied" });
      await submit();
      expect(screen.getByText(FAILED)).toBeTruthy();
      expect(screen.queryByText(SAVED)).toBeNull();

      action.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await submit();
      expect(screen.getByText(FAILED)).toBeTruthy();
      expect(screen.queryByText(SAVED)).toBeNull();

      action.mockResolvedValueOnce({ success: true });
      await submit();
      expect(screen.getByText(SAVED)).toBeTruthy();
      expect(screen.queryByText(FAILED)).toBeNull();
    });
  }
});

describe("Clinics: a failed add keeps what was typed", () => {
  it("a refused save and no answer keep the fields; a save clears them", async () => {
    wrap(<ClinicsClient clinics={[]} />);
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(pt.clinics.add) })[0]);
    const name = screen.getByPlaceholderText(pt.clinics.namePlaceholder) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Clínica Centro" } });
    const save = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: pt.clinics.save })); });

    clinics.addClinic.mockResolvedValueOnce({ error: "x", code: "generic" });
    await save();
    expect(name.value).toBe("Clínica Centro");
    expect(screen.getByText(pt.clinics.genericError)).toBeTruthy();

    clinics.addClinic.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await save();
    expect(name.value).toBe("Clínica Centro");
    expect(screen.getByText(pt.clinics.genericError)).toBeTruthy();
    expect(clinics.addClinic).toHaveBeenCalledTimes(2);
    expect((clinics.addClinic.mock.calls[1][0] as FormData).get("name")).toBe("Clínica Centro");
  });
});
