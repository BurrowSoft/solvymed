import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
const save = vi.fn();
vi.mock("@/lib/tourActions", () => ({ saveTourProgress: (...a: unknown[]) => save(...a) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { TourProvider } from "@/components/tour/TourProvider";
import { OPEN_EVENT } from "@/components/solvyai/SolvyAiSettings";
import { SOLVYAI_INTRO_TOUR } from "@/lib/solvyaiIntro";

beforeEach(() => {
  document.body.innerHTML = "";
  save.mockClear();
});

function renderProvider(props: Partial<Parameters<typeof TourProvider>[0]> = {}) {
  return render(
    <TourProvider role="professional" paymentQr="pix" prefix="" entry={null} introPending {...props}>
      <div />
    </TourProvider>,
  );
}

// UX (go-live): "Meet SolvyAI ✦" once, for doctors, after everything else;
// its state is tour_progress news:solvyai (113), like the app's.
describe("Meet SolvyAI", () => {
  it("its seen key is news:solvyai (the app's)", () => {
    expect(SOLVYAI_INTRO_TOUR).toBe("news:solvyai");
  });

  it("shows once; seen as soon as shown; Try it now opens the panel with \"What can SolvyAI do?\" first", async () => {
    vi.useFakeTimers();
    const opened = vi.fn();
    window.addEventListener(OPEN_EVENT, opened);
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("solvyaiIntro.title")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("skipped", 0, "news:solvyai");
    fireEvent.click(screen.getByText("solvyaiIntro.tryNow"));
    expect(screen.queryByText("solvyaiIntro.title")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("completed", 0, "news:solvyai");
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ chip: "solvyaiIntro.whatCanDo" });
    window.removeEventListener(OPEN_EVENT, opened);
    vi.useRealTimers();
  });

  it("Later / Esc closes it (already saved as seen)", async () => {
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { vi.advanceTimersByTime(1000); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("solvyaiIntro.title")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("waits for the Novidades popup, never on top of it", async () => {
    vi.useFakeTimers();
    renderProvider({ newsPending: true });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("news.title")).toBeInTheDocument();
    expect(screen.queryByText("solvyaiIntro.title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("news.later"));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("solvyaiIntro.title")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("?solvyai-intro=1 only where the server allows it (never Production, UX)", async () => {
    vi.useFakeTimers();
    window.history.pushState({}, "", "/dashboard?solvyai-intro=1");
    const off = renderProvider({ introPending: false, introTestable: false });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText("solvyaiIntro.title")).not.toBeInTheDocument();
    off.unmount();
    window.history.pushState({}, "", "/dashboard");
    vi.useRealTimers();
  });

  it("never for secretaries", async () => {
    vi.useFakeTimers();
    renderProvider({ role: "secretary", paymentQr: null });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText("solvyaiIntro.title")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

// 9a: the card and the panel share one condition, so a locked doctor (only
// Settings open, no panel) never gets a card whose Try would do nothing.
describe("where the card may show (solvyAiPanelOn / solvyAiIntroOn)", () => {
  it("doctors with access, not secretaries, never while locked; the card also needs solvyai-live", async () => {
    vi.resetModules();
    vi.doMock("@/lib/liveFeatures", () => ({ liveFeatures: { solvyAi: true } }));
    vi.doMock("@/lib/conditions", () => ({ conditionMet: (id: string) => id === "solvyai-live" }));
    const { solvyAiPanelOn, solvyAiIntroOn } = await import("@/lib/solvyaiIntro");
    const active = { subscription_status: "active", trial_ends_at: null, current_period_end: null } as never;
    const locked = { subscription_status: "canceled", trial_ends_at: null, current_period_end: null } as never;
    expect(solvyAiPanelOn({ isSecretary: false, sub: active })).toBe(true);
    expect(solvyAiIntroOn({ isSecretary: false, sub: active })).toBe(true);
    expect(solvyAiPanelOn({ isSecretary: false, sub: locked })).toBe(false);
    expect(solvyAiIntroOn({ isSecretary: false, sub: locked })).toBe(false);
    expect(solvyAiIntroOn({ isSecretary: true, sub: active })).toBe(false);
    vi.doUnmock("@/lib/conditions");
    vi.resetModules();
    vi.doMock("@/lib/liveFeatures", () => ({ liveFeatures: { solvyAi: true } }));
    vi.doMock("@/lib/conditions", () => ({ conditionMet: () => false }));
    const off = await import("@/lib/solvyaiIntro");
    expect(off.solvyAiPanelOn({ isSecretary: false, sub: active })).toBe(true);
    expect(off.solvyAiIntroOn({ isSecretary: false, sub: active })).toBe(false);
    vi.doUnmock("@/lib/liveFeatures");
    vi.doUnmock("@/lib/conditions");
  });
});
