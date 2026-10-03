import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { OpenInApp, openInAppNav, PLAY_FALLBACK_MS } from "@/components/OpenInApp";
import { appOpenUrl, playStoreUrl } from "@/lib/appStores";

// "Abrir no app SolvyMed" (Vitor: Gmail's browser ignores App Links): an
// Android phone only; it opens solvymed://login (38) or the Play page.

function device(ua: string, narrow: boolean) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: narrow && q.includes("max-width"), addEventListener() {}, removeEventListener() {} }));
}
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const show = (onlyWithParam = false) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <OpenInApp onlyWithParam={onlyWithParam} />
    </NextIntlClientProvider>,
  );

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("OpenInApp", () => {
  it("an Android phone: the app button (intent to solvymed://login, Play as fallback) + Continuar no site", () => {
    device(ANDROID, true);
    show();
    const open = screen.getByRole("link", { name: "Abrir no app SolvyMed" });
    expect(open).toHaveAttribute("href", appOpenUrl());
    fireEvent.click(screen.getByRole("button", { name: "Continuar no site" }));
    expect(screen.queryByTestId("open-in-app")).toBeNull();
  });

  it("nothing on an iPhone (no App Store build) or a desktop", () => {
    device(IPHONE, true);
    const { unmount } = show();
    expect(screen.queryByTestId("open-in-app")).toBeNull();
    unmount();
    device(ANDROID, false);
    show();
    expect(screen.queryByTestId("open-in-app")).toBeNull();
  });

  it("onlyWithParam: only with ?app=1 (the secretary's first dashboard)", () => {
    device(ANDROID, true);
    const { unmount } = show(true);
    expect(screen.queryByTestId("open-in-app")).toBeNull();
    unmount();
    window.history.replaceState(null, "", "/dashboard?app=1");
    show(true);
    expect(screen.getByTestId("open-in-app")).toBeInTheDocument();
  });

  it("no app took over (the page still shows): it goes to the Play listing itself (09)", () => {
    vi.useFakeTimers();
    device(ANDROID, true);
    const go = vi.spyOn(openInAppNav, "go").mockImplementation(() => {});
    show();
    const open = screen.getByRole("link", { name: "Abrir no app SolvyMed" });
    open.addEventListener("click", (e) => e.preventDefault()); // jsdom can't follow intent://
    fireEvent.click(open);
    vi.advanceTimersByTime(PLAY_FALLBACK_MS - 1);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledWith(playStoreUrl("invite"));
    vi.useRealTimers();
  });

  it("the app opened (the page lost focus / hid): no Play fallback", () => {
    vi.useFakeTimers();
    device(ANDROID, true);
    const go = vi.spyOn(openInAppNav, "go").mockImplementation(() => {});
    show();
    const open = screen.getByRole("link", { name: "Abrir no app SolvyMed" });
    open.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(open);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(PLAY_FALLBACK_MS * 2);
    expect(go).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("the intent URL", () => {
    expect(appOpenUrl()).toMatch(/^intent:\/\/login#Intent;scheme=solvymed;package=com\.burrowsoft\.solvymed;S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com%2F.+;end$/);
  });
});
