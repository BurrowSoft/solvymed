import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// 1.9.0 offline guard PR2b: a failed cancel no longer loses the typed
// reason, and a server code never shows raw on screen.

const T = vi.hoisted(() => (k: string) => k);
vi.mock("next-intl", () => ({ useTranslations: () => T, useLocale: () => "en" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/schedule", useSearchParams: () => new URLSearchParams(), useParams: () => ({}),
}));
vi.mock("@/lib/statusReason", async (orig) => ({ ...(await orig<typeof import("@/lib/statusReason")>()), statusReasonLive: () => true }));
const h = vi.hoisted(() => ({ updateStatus: vi.fn(), createProcedure: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({
  updateAppointmentStatus: (...a: unknown[]) => h.updateStatus(...a),
  createAppointment: vi.fn(), deleteAppointment: vi.fn(), blockTime: vi.fn(), moveAppointment: vi.fn(),
  searchPatientsForPicker: vi.fn(), undoScheduleChange: vi.fn(), getScheduleDay: vi.fn(async () => null),
}));
vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => ({
  createProcedure: (...a: unknown[]) => h.createProcedure(...a),
  updateProfile: vi.fn(), updateClinic: vi.fn(), updateWorkingHours: vi.fn(), toggleProcedure: vi.fn(), deleteProcedure: vi.fn(),
  updateSchedulingRules: vi.fn(), unblockPatient: vi.fn(), generatePublicInviteCode: vi.fn(),
}));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

import { AppointmentStatusSelect } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { ProceduresPanel } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";

afterEach(() => vi.clearAllMocks());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe("cancel with a reason, without an answer", () => {
  it("the error shows and the reason box comes back with the typed reason", async () => {
    h.updateStatus.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AppointmentStatusSelect id="a1" current="confirmed" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cancelled" } });
    fireEvent.change(screen.getByLabelText("reasonLabel"), { target: { value: "Médica em congresso" } });
    await act(async () => { fireEvent.click(screen.getByText("confirmCancel")); });
    await settle();
    expect(h.updateStatus).toHaveBeenCalledWith("a1", "cancelled", "Médica em congresso");
    expect(screen.getByText("genericError")).toBeInTheDocument();
    expect((screen.getByLabelText("reasonLabel") as HTMLTextAreaElement).value).toBe("Médica em congresso");
  });
});

describe("a new procedure", () => {
  it("a refusal code is never shown raw; no answer shows the same save-failed text", async () => {
    render(<ProceduresPanel procedures={[]} currency="BRL" />);
    fireEvent.click(screen.getAllByRole("button").find((b) => /add|addProcedure|newProcedure/i.test(b.textContent ?? ""))!);
    const form = document.querySelector("form")!;
    for (const outcome of [() => h.createProcedure.mockResolvedValueOnce({ error: "permission denied for table procedures" }), () => h.createProcedure.mockRejectedValueOnce(new TypeError("Failed to fetch"))]) {
      outcome();
      await act(async () => { fireEvent.submit(form); });
      await settle();
      expect(screen.getByText("saveFailed")).toBeInTheDocument();
      expect(screen.queryByText(/permission denied/)).toBeNull();
    }
  });
});
