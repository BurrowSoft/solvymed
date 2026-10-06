import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// The tour's "Experimentar agora" on the SolvyAI step (UX 36, like the
// app): the tour pauses on the next step, SolvyAI opens asking "O que o
// SolvyAI pode fazer?", and closing SolvyAI offers "Continuar o tour?".

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }), usePathname: () => "/dashboard" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, v?: Record<string, unknown>) => (v ? `${key}:${JSON.stringify(v)}` : key),
}));
const saved = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/lib/tourActions", () => ({ saveTourProgress: async (...a: unknown[]) => { saved.push(a); } }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
// SolvyAI on: its step is part of the doctor's tour.
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, solvyAi: true, news: false } };
});

import { TourOverlay } from "@/components/tour/TourOverlay";
import { TourProvider } from "@/components/tour/TourProvider";
import { CLOSED_EVENT, OPEN_EVENT } from "@/components/solvyai/SolvyAiSettings";
import { tourSteps } from "@/lib/tour";

function addTarget(name: string) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => ({ top: 10, left: 10, width: 100, height: 40, right: 110, bottom: 50, x: 10, y: 10, toJSON: () => ({}) });
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
  el.scrollIntoView = () => {};
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  saved.length = 0;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe("TourOverlay: Experimentar agora", () => {
  const steps = [
    { id: "home", target: "home", titleKey: "homeTitle", textKey: "homeText", path: "/dashboard" },
    { id: "solvyai", target: "solvyai", titleKey: "solvyaiTitle", textKey: "solvyaiText", path: "/dashboard" },
  ];

  it("only on the SolvyAI step", async () => {
    vi.useFakeTimers();
    addTarget("home");
    addTarget("solvyai");
    const onTryNow = vi.fn();
    render(<TourOverlay steps={steps} prefix="" onClose={() => {}} onTryNow={onTryNow} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText("tryNow")).toBeNull();
    fireEvent.click(screen.getByText("next"));
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByText("tryNow"));
    expect(onTryNow).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});

describe("TourProvider: pause and resume", () => {
  it("opens SolvyAI with the question, then offers to continue on the next step", async () => {
    const all = tourSteps("professional", "pix");
    const at = all.findIndex((s) => s.id === "solvyai");
    expect(at).toBeGreaterThanOrEqual(0);
    vi.useFakeTimers();
    for (const s of all) addTarget(s.target);
    const opened: unknown[] = [];
    const onOpen = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(OPEN_EVENT, onOpen);
    render(<TourProvider role="professional" paymentQr="pix" prefix="" entry="resume" resumeStep={at}><div /></TourProvider>);
    fireEvent.click(screen.getByText("continue"));
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByText("tryNow"));
    expect(opened).toEqual([{ text: "tryNowQuestion" }]);
    expect(saved).toContainEqual(["started", at + 1]);
    // The tour is paused: no overlay, and no resume offer yet.
    expect(screen.queryByText("tryNow")).toBeNull();
    expect(screen.queryByText("continue")).toBeNull();
    // SolvyAI closes → "Continuar o tour? (passo n de N)" on the next step.
    act(() => { window.dispatchEvent(new Event(CLOSED_EVENT)); });
    expect(screen.getByText(`resumeTitle:${JSON.stringify({ n: at + 2, total: all.length })}`)).toBeInTheDocument();
    // Above the ✦ button's corner (bottom-5), never on top of it (53, cf).
    expect(screen.getByTestId("tour-resume").className).toContain("bottom-24");
    window.removeEventListener(OPEN_EVENT, onOpen);
    vi.useRealTimers();
  });
});
