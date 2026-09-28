import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => pathname }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
const save = vi.fn();
vi.mock("@/lib/tourActions", () => ({ saveTourProgress: (...a: unknown[]) => save(...a) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { NEWS, newsItemsFor, newsSteps, newsTourId } from "@/lib/news";
import { TourProvider } from "@/components/tour/TourProvider";

beforeEach(() => {
  document.body.innerHTML = "";
  save.mockClear();
  pathname = "/dashboard";
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe("the 1.4.0 announcement (walkthrough §4a)", () => {
  it("SolvyAI is hidden until it's live; the tour item is for doctors and secretaries", () => {
    const r = NEWS.find((n) => n.release === "1.4.0")!;
    expect(newsItemsFor(r, "professional").map((i) => i.id)).toEqual(["tour"]);
    expect(newsItemsFor(r, "secretary").map((i) => i.id)).toEqual(["tour"]);
    expect(newsSteps(r, "professional")[0]).toMatchObject({ target: "nav-settings", titleKey: "r140.tourTitle", textKey: "r140.tourSpot" });
  });

  it("an item appears only for its roles and when live, at most 3", () => {
    const fake = { release: "9.9.9", items: [1, 2, 3, 4].map((n) => ({ id: `i${n}`, target: "x", path: "/dashboard", titleKey: "t", lineKey: "l", textKey: "s", roles: ["professional" as const], live: n !== 2 })) };
    expect(newsItemsFor(fake, "professional").map((i) => i.id)).toEqual(["i1", "i3", "i4"]);
    expect(newsItemsFor(fake, "secretary")).toEqual([]);
  });

  it("its state is the 113 tour id news:<release>", () => {
    expect(newsTourId("1.4.0")).toBe("news:1.4.0");
  });
});

// jsdom has no layout: give a target a size, an offsetParent and a place on screen.
function addTarget(name: string) {
  const el = document.createElement("button");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => ({ top: 10, left: 10, width: 40, height: 40, right: 50, bottom: 50, x: 10, y: 10, toJSON: () => ({}) });
  Object.defineProperty(el, "offsetParent", { get: () => document.body });
  el.scrollIntoView = () => {};
  document.body.appendChild(el);
}

function renderProvider(props: Partial<Parameters<typeof TourProvider>[0]> = {}) {
  return render(
    <TourProvider role="professional" paymentQr="pix" prefix="" entry={null} newsPending {...props}>
      <div />
    </TourProvider>,
  );
}

describe("the Novidades popup", () => {
  it("shows once on the home page; Not now saves it as skipped for this release", async () => {
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.getByText("news.title")).toBeInTheDocument();
    expect(screen.getByText("news.r140.tourTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("news.later"));
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("skipped", 0, "news:1.4.0");
    vi.useRealTimers();
  });

  it("Esc = Not now", async () => {
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("skipped", 0, "news:1.4.0");
    vi.useRealTimers();
  });

  it("See what's new: on a narrow screen the step spotlights the menu button with drawer-aware text", async () => {
    vi.useFakeTimers();
    addTarget("nav-menu"); // the sidebar link is in the closed drawer; only the menu button is on screen
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    fireEvent.click(screen.getByText("news.see"));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    expect(screen.getByText("news.r140.tourSpotMenu")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("started", 0, "news:1.4.0");
    vi.useRealTimers();
  });

  it("with the sidebar link on screen, its own text", async () => {
    vi.useFakeTimers();
    addTarget("nav-settings");
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    fireEvent.click(screen.getByText("news.see"));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("news.r140.tourSpot")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("if no step can be shown at all, the release is NOT marked as seen (UX)", async () => {
    vi.useFakeTimers();
    renderProvider(); // no targets on screen at all
    await act(async () => { vi.advanceTimersByTime(900); });
    fireEvent.click(screen.getByText("news.see"));
    await act(async () => { vi.advanceTimersByTime(3500); });
    expect(save).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("not when already seen, not off the home page, not over a one-time card", async () => {
    vi.useFakeTimers();
    const { unmount } = renderProvider({ newsPending: false });
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    unmount();

    pathname = "/dashboard/patients";
    const r2 = renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    r2.unmount();

    pathname = "/dashboard";
    const block = document.createElement("section");
    block.setAttribute("data-tour-block", "");
    document.body.appendChild(block);
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("a new user gets the main tour first, not the popup over it", async () => {
    vi.useFakeTimers();
    renderProvider({ entry: "auto" });
    await act(async () => { vi.advanceTimersByTime(900); });
    // The main tour started (its first step was saved), the popup waits.
    expect(save).toHaveBeenCalledWith("started", 0);
    expect(screen.queryByText("news.title")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
