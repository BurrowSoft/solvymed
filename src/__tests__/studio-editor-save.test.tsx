import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { DEFAULT_DESIGN } from "@/lib/studio/design";

// Document Studio PR3, the editor's save (fa, #540): a design changed
// elsewhere shows the conflict text and Refresh Page; a save whose answer
// never comes ends in an error, never "Saving…" forever.

const save = vi.fn();
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio-actions", () => ({ saveMyDesign: (...a: unknown[]) => save(...a) }));
// The preview draws a real PDF; not needed here.
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio/StudioPreview", () => ({ StudioPreview: () => null }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio/StudioPosters", () => ({ StudioPosters: () => null }));
// The save's time limit, shortened (fake timers stall the provider).
vi.mock("@/lib/netError", async (orig) => {
  const actual = await orig<typeof import("@/lib/netError")>();
  return { ...actual, timeLimit: <T, F>(p: Promise<T>, _ms: number, f: F) => actual.timeLimit(p, 30, f) };
});
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const { StudioEditor } = await import("@/app/[locale]/(site)/dashboard/settings/studio/StudioEditor");

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StudioEditor
        initial={structuredClone(DEFAULT_DESIGN)} saved={false} version={3} country="BR"
        practice={{ displayName: "Dr. Test", specialty: null, registrationLine: null, clinicName: null, locations: [] }}
        logos={{ square: null, wide: null, reversed: null }} textTypes={["prescription"]} backHref="/dashboard/settings" posterHours={null} inviteUrl={null}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => save.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("Studio editor: saving", () => {
  it("a conflict shows the conflict text and Refresh Page; Saving… ends", async () => {
    save.mockResolvedValue({ ok: false, code: "conflict" });
    show();
    await act(async () => { fireEvent.click(screen.getByTestId("studio-save")); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ font: "sarabun" }), 3);
    expect(screen.getByTestId("studio-conflict").textContent).toContain(en.studio.conflict);
    expect(screen.getByRole("button", { name: en.versionGate.reload })).toBeInTheDocument();
    expect(screen.getByTestId("studio-save").textContent).toBe(en.studio.save);
  });

  it("a save whose answer never comes ends in the error after the time limit", async () => {
    // An answer that comes far too late (settled at the end, after the limit).
    let late: (v: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => { late = r; }));
    show();
    await act(async () => { fireEvent.click(screen.getByTestId("studio-save")); });
    expect(screen.getByTestId("studio-save").textContent).toBe(en.brand.saving);
    // Waits for the limit (30 ms here) without a fixed sleep: under a busy
    // full suite a fixed wait lost the race.
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.studio.error));
    expect(screen.getByTestId("studio-save").textContent).toBe(en.studio.save);
    await act(async () => { late({ ok: false, code: "conflict" }); });
  });

  it("a save that works shows the saved line", async () => {
    save.mockResolvedValue({ ok: true, version: 4 });
    show();
    await act(async () => { fireEvent.click(screen.getByTestId("studio-save")); });
    expect(screen.getByTestId("studio-saved").textContent).toBe(en.studio.saved);
  });
});
