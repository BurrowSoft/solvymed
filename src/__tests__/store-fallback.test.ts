import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallBackIfStillVisible, STORE_FALLBACK_MS } from "@/lib/storeFallback";

// The tap fallback (01 on #601: a phone with Play disabled or stubbed made
// the intent a silent no-op): still visible after the delay → the https
// listing, once; the app opening (page hidden / left / blurred) cancels it.

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
};
const WEB = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed";

describe("fallBackIfStillVisible", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("nothing took over (still visible): the https listing, once", () => {
    const go = vi.fn();
    fallBackIfStillVisible(WEB, STORE_FALLBACK_MS, go);
    vi.advanceTimersByTime(STORE_FALLBACK_MS - 1);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(WEB);
    vi.advanceTimersByTime(10_000);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the page hides (the Play app opened)", () => setVisibility("hidden")],
    ["the page is left", () => window.dispatchEvent(new Event("pagehide"))],
    ["the page loses focus (the app's chooser)", () => window.dispatchEvent(new Event("blur"))],
  ])("%s: no fallback", (_name, takeOver) => {
    const go = vi.fn();
    fallBackIfStillVisible(WEB, STORE_FALLBACK_MS, go);
    vi.advanceTimersByTime(500);
    takeOver();
    if (visibility === "hidden") setVisibility("visible"); // back later: still no navigation
    vi.advanceTimersByTime(STORE_FALLBACK_MS * 2);
    expect(go).not.toHaveBeenCalled();
  });

  it("a second tap replaces the pending fallback: never two navigations", () => {
    const go = vi.fn();
    fallBackIfStillVisible(WEB, STORE_FALLBACK_MS, go);
    vi.advanceTimersByTime(1000);
    fallBackIfStillVisible(WEB, STORE_FALLBACK_MS, go);
    vi.advanceTimersByTime(STORE_FALLBACK_MS * 3);
    expect(go).toHaveBeenCalledTimes(1);
  });
});
