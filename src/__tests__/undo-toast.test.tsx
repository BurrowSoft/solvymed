import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/dashboard/schedule", useSearchParams: () => new URLSearchParams() }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useLocale: () => "pt-BR" }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({ undoScheduleChange: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({}));

import { ScheduleUndoToast } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { UNDO_EVENT } from "@/lib/scheduleUndo";

// Vitor (31): in the dark theme the toast became a blank white box. The
// theme remaps slate-900 to near-white while white text stays white, so the
// toast uses fixed colours the theme never touches.
describe("the Agenda's Undo toast", () => {
  it("uses theme-proof colours (no slate-900 / teal-300) and keeps the button on one line", async () => {
    const { container } = render(<ScheduleUndoToast />);
    await act(async () => { window.dispatchEvent(new CustomEvent(UNDO_EVENT, { detail: { kind: "booked", sig: "x" } })); });
    const box = container.querySelector("[role=status]")!;
    expect(box.className).toContain("bg-[#0f172a]");
    expect(box.className).not.toMatch(/bg-slate-900|text-white\b/);
    const button = screen.getByRole("button");
    expect(button.className).toContain("whitespace-nowrap");
    expect(button.className).not.toContain("teal-300");
  });
});
