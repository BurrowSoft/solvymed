import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// A secretary leaving one doctor while she still serves another stays in the
// dashboard, on her schedule (53/cf on #345); leaving her last doctor goes
// to "not connected" as before.

const h = vi.hoisted(() => ({ leave: vi.fn(), push: vi.fn(), assign: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/settings/team-actions", () => ({ leaveClinic: h.leave }));

import { LeaveClinicButton } from "@/app/[locale]/(site)/dashboard/settings/LeaveClinicButton";

beforeEach(() => {
  h.leave.mockReset(); h.push.mockReset(); h.assign.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(window, "location", { value: { ...window.location, assign: h.assign }, writable: true });
});

const show = () => render(<NextIntlClientProvider locale="pt-BR" messages={pt}><LeaveClinicButton doctorName="Dr. B" locale="pt-BR" /></NextIntlClientProvider>);

describe("Sair da clínica", () => {
  it("still serving another doctor: her schedule, never \"not connected\"", async () => {
    h.leave.mockResolvedValue({ ok: true, stillLinked: true });
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith("/pt-BR/dashboard/schedule"));
    expect(h.push).not.toHaveBeenCalled();
  });

  it("her last doctor: \"not connected\", as before", async () => {
    h.leave.mockResolvedValue({ ok: true, stillLinked: false });
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/not-connected"));
    expect(h.assign).not.toHaveBeenCalled();
  });
});
