import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { tourSteps } from "@/lib/tour";
import { tourEntry } from "@/lib/tourState";

const push = vi.fn();
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, v?: Record<string, unknown>) => (v ? `${key}:${JSON.stringify(v)}` : key),
}));

import { TourOverlay } from "@/components/tour/TourOverlay";

describe("tour definitions (specs/walkthrough.md)", () => {
  it("doctor: SolvyAI hidden until it exists; order as in the spec", () => {
    const ids = tourSteps("professional", "pix").map((s) => s.id);
    expect(ids).toEqual(["home", "new-appointment", "schedule", "patients", "payments", "trial", "invite", "settings"]);
    expect(ids).not.toContain("solvyai");
  });

  it("the payments step names the practice country's QR", () => {
    const title = (qr: "pix" | "promptpay" | null) => tourSteps("professional", qr).find((s) => s.id === "payments")!.titleKey;
    expect(title("pix")).toBe("paymentsPixTitle");
    expect(title("promptpay")).toBe("paymentsPromptPayTitle");
    expect(title(null)).toBe("paymentsTitle");
  });

  it("sidebar steps fall back to the menu button on narrow screens (doctor and secretary)", () => {
    const withMenu = (role: "professional" | "secretary") =>
      tourSteps(role, "pix").filter((s) => s.fallback?.target === "nav-menu").map((s) => `${s.id}:${s.fallback?.menuSection}`);
    expect(withMenu("professional")).toEqual(["schedule:schedule", "patients:patients", "payments:payments", "settings:settings"]);
    expect(withMenu("secretary")).toEqual(["schedule:schedule", "patients:patients"]);
  });

  it("secretary: 4 steps, no SolvyAI, no settings/invite/payments", () => {
    expect(tourSteps("secretary", null).map((s) => s.id)).toEqual(["home", "new-appointment", "schedule", "patients"]);
  });
});

describe("tourEntry (server state, migration 113)", () => {
  it("no table yet (or a read error) → nothing starts by itself", () => {
    expect(tourEntry({ kind: "unavailable" })).toBeNull();
  });
  it("no row → auto-start; started → resume; done → nothing", () => {
    expect(tourEntry({ kind: "none" })).toBe("auto");
    expect(tourEntry({ kind: "row", status: "started", step: 3 })).toBe("resume");
    expect(tourEntry({ kind: "row", status: "completed", step: 0 })).toBeNull();
    expect(tourEntry({ kind: "row", status: "skipped", step: 2 })).toBeNull();
  });
});

// jsdom has no layout: give the targets a size and an offsetParent.
function addTarget(name: string) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => ({ top: 10, left: 10, width: 100, height: 40, right: 110, bottom: 50, x: 10, y: 10, toJSON: () => ({}) });
  Object.defineProperty(el, "offsetParent", { get: () => document.body });
  el.scrollIntoView = () => {};
  document.body.appendChild(el);
  return el;
}

describe("TourOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    push.mockClear();
    pathname = "/dashboard";
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });

  const steps = [
    { id: "a", target: "a", titleKey: "aTitle", textKey: "aText", path: "/dashboard" },
    { id: "missing", target: "missing", titleKey: "mTitle", textKey: "mText", path: "/dashboard" },
    { id: "b", target: "b", titleKey: "bTitle", textKey: "bText", path: "/dashboard" },
  ];

  it("drops a step whose element isn't on this page up front (the count is right from step 1), and completes", async () => {
    vi.useFakeTimers();
    addTarget("a");
    addTarget("b");
    const onClose = vi.fn();
    render(<TourOverlay steps={steps} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("aTitle")).toBeInTheDocument();
    expect(screen.getByText('progress:{"n":1,"total":2}', { selector: "p:not(.sr-only)" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("next"));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("bTitle")).toBeInTheDocument();
    expect(screen.getByText('progress:{"n":2,"total":2}', { selector: "p:not(.sr-only)" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("finish"));
    expect(onClose).toHaveBeenCalledWith("completed", 1);
    vi.useRealTimers();
  });

  it("Esc asks before skipping; the dimmed area doesn't close it", async () => {
    vi.useFakeTimers();
    addTarget("a");
    const onClose = vi.fn();
    render(<TourOverlay steps={[steps[0]]} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(document.querySelector("svg")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("skipConfirmTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("skip"));
    expect(onClose).toHaveBeenCalledWith("skipped", 0);
    vi.useRealTimers();
  });

  it("a replay started on another page: arriving on the dashboard drops its missing steps at once (the count is right)", async () => {
    vi.useFakeTimers();
    addTarget("a");
    addTarget("b");
    pathname = "/dashboard/settings";
    const onClose = vi.fn();
    const { rerender } = render(<TourOverlay steps={steps} prefix="" onClose={onClose} />);
    expect(push).toHaveBeenCalledWith("/dashboard");
    pathname = "/dashboard";
    rerender(<TourOverlay steps={steps} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    await act(async () => { vi.advanceTimersByTime(400); });
    // "missing" (same page, not on screen) is gone before step 2: 1 of 2, not 1 of 3.
    expect(screen.getByText('progress:{"n":1,"total":2}', { selector: "p:not(.sr-only)" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("a step whose target is off-screen uses its fallback (the menu button) with the fallback text", async () => {
    vi.useFakeTimers();
    addTarget("menu");
    const onClose = vi.fn();
    render(<TourOverlay steps={[{ ...steps[0], target: "missing", fallback: { target: "menu", textKey: "menuText" } }]} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("menuText")).toBeInTheDocument();
    fireEvent.click(screen.getByText("finish"));
    expect(onClose).toHaveBeenCalledWith("completed", 0);
    vi.useRealTimers();
  });

  it("a sidebar step on a narrow screen: the menu button, with the drawer line before the step's text (UX)", async () => {
    vi.useFakeTimers();
    addTarget("nav-menu");
    const onClose = vi.fn();
    render(<TourOverlay steps={[{ ...steps[0], target: "nav-schedule", fallback: { target: "nav-menu", menuSection: "schedule" } }]} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('inMenu:{"section":"schedule"}aText')).toBeInTheDocument();
    expect(screen.getByText("aTitle")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("a step on another page whose element never shows up is dropped when reached", async () => {
    vi.useFakeTimers();
    addTarget("a");
    const onClose = vi.fn();
    const { rerender } = render(
      <TourOverlay steps={[steps[0], { ...steps[1], path: "/dashboard/settings" }]} prefix="" onClose={onClose} />,
    );
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('progress:{"n":1,"total":2}', { selector: "p:not(.sr-only)" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("next"));
    expect(push).toHaveBeenCalledWith("/dashboard/settings");
    pathname = "/dashboard/settings";
    rerender(<TourOverlay steps={[steps[0], { ...steps[1], path: "/dashboard/settings" }]} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(3500); });
    expect(onClose).toHaveBeenCalledWith("completed", 0);
    vi.useRealTimers();
  });

  it("an element translated off-screen (the closed phone drawer) is not a step", async () => {
    vi.useFakeTimers();
    const off = addTarget("a");
    off.getBoundingClientRect = () => ({ top: 10, left: -300, width: 256, height: 40, right: -44, bottom: 50, x: -300, y: 10, toJSON: () => ({}) });
    const onClose = vi.fn();
    render(<TourOverlay steps={[steps[0]]} prefix="" onClose={onClose} />);
    await act(async () => { vi.advanceTimersByTime(3500); });
    // Dropped: the only step is gone, so the tour ends without spotlighting
    // anything, and says so ("none": nothing may be recorded as seen).
    expect(screen.queryByText("aTitle")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledWith("none", 0);
    vi.useRealTimers();
  });

  it("navigates to a step on another page first", () => {
    render(<TourOverlay steps={[{ ...steps[0], path: "/dashboard/settings" }]} prefix="/pt-BR" onClose={() => {}} />);
    expect(push).toHaveBeenCalledWith("/pt-BR/dashboard/settings");
  });
});
