import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Items 19/21/25/33: the Agenda, requests, patients and the patient's own
// appointments refetch when the tab comes back (at most every 10 s), every
// 60 s while visible, and on "Atualizar".

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AutoRefresh, REFRESH_EVERY_MS } from "@/components/AutoRefresh";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

const show = () =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <AutoRefresh />
    </NextIntlClientProvider>,
  );

afterEach(() => { vi.useRealTimers(); refresh.mockReset(); visibility = "visible"; });

describe("AutoRefresh", () => {
  it("every 60 s while visible; never while hidden", () => {
    vi.useFakeTimers();
    show();
    act(() => { vi.advanceTimersByTime(REFRESH_EVERY_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    act(() => { vi.advanceTimersByTime(REFRESH_EVERY_MS * 3); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("coming back to the tab refreshes, but not twice within 10 s", () => {
    vi.useFakeTimers();
    show();
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(refresh).not.toHaveBeenCalled(); // just mounted
    act(() => { vi.advanceTimersByTime(15_000); });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Atualizar refreshes now", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
