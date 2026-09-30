import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The Agenda's Desfazer toast: shown on an offer, one run per offer (a
// double click runs nothing more), the day refreshed after.

const h = vi.hoisted(() => ({ calls: 0, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => "/pt-BR/dashboard/schedule", useParams: () => ({}),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({
  undoScheduleChange: async () => { h.calls++; await new Promise((r) => setTimeout(r, 20)); return { ok: true }; },
}));

import { ScheduleUndoToast } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { offerUndo } from "@/lib/scheduleUndo";

describe("ScheduleUndoToast", () => {
  it("offers Desfazer after a cancel; runs once; says Desfeito and reloads the day", async () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ScheduleUndoToast /></NextIntlClientProvider>);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => offerUndo({ kind: "cancelled", ids: ["a"], told: 3, dates: ["2026-10-05"], start: "09:00", status: "cancelled", prevStatus: "scheduled", iat: Date.now(), sig: "x" }));
    expect(screen.getByText("Consulta cancelada")).toBeInTheDocument();
    const button = screen.getByText("Desfazer (10 s)");
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("Desfeito.")).toBeInTheDocument());
    expect(h.calls).toBe(1);
    expect(h.refresh).toHaveBeenCalled();
  });

  it("nothing to offer (a push already went out): no toast", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ScheduleUndoToast /></NextIntlClientProvider>);
    act(() => offerUndo(null));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
