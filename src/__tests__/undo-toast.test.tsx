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
// 9a: the same trap anywhere (the tour's Skip, Block time, Archive): a dark
// slate background the theme lightens + white text. No class string pairs them.
describe("no white text on a theme-remapped dark slate background", () => {
  it("none in src/", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const { join } = await import("path");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "__tests__") walk(p); } else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk(join(process.cwd(), "src"));
    const bad = /"[^"]*(bg-slate-(700|800|900)[^"]*\btext-white\b|\btext-white\b[^"]*bg-slate-(700|800|900))[^"]*"/;
    const hits = files.filter((f) => bad.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

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

// The "All" schedule's dispatcher (166) imports every action; these tests mock them.
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions", () => ({ actForRow: vi.fn() }));
