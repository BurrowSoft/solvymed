import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { heroCut, heroMedia } from "@/lib/heroMedia";
import { HeroClip } from "@/components/HeroClip";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";

// Landing hero Phase 1: the silent clip (poster first, loads when idle and in
// view, paused off screen, never with reduced motion) and the tour link.

describe("which cut and promo each landing locale gets", () => {
  it.each([
    ["pt-BR", "br", "https://youtu.be/TdN3jxEczoQ"],
    ["en", "br", null], // the BR clip, but no Portuguese-voiced tour (01)
    ["th", "th", "https://youtu.be/9zi10rrXTYY"],
    ["ja", "br", null], // the explicit default
  ])("%s → %s", (locale, cut, tour) => {
    expect(heroCut(locale)).toBe(cut);
    const m = heroMedia(locale);
    expect(m).toEqual({ cut, poster: `/hero/hero-${cut}-poster.jpg`, mp4: `/hero/hero-${cut}.mp4`, webm: `/hero/hero-${cut}.webm`, tourUrl: tour });
  });

  it("has the tour label in en, pt-BR and th", () => {
    expect(en.hero.watchTour).toBe("Watch the 2-minute tour");
    expect(pt.hero.watchTour).toBe("Ver o tour de 2 minutos");
    expect(th.hero.watchTour).toBe("ดูทัวร์ 2 นาที");
  });
});

describe("HeroClip", () => {
  let ioCb: (e: { isIntersecting: boolean }[]) => void;
  let idleCb: (() => void) | null;
  let reduce: boolean;
  let reduceListener: ((e: { matches: boolean }) => void) | null;
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  const load = vi.fn();

  beforeEach(() => {
    idleCb = null;
    reduce = false;
    reduceListener = null;
    play.mockClear();
    pause.mockClear();
    load.mockClear();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof ioCb) {
          ioCb = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      idleCb = cb;
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", () => {});
    vi.stubGlobal("matchMedia", () => ({
      matches: reduce,
      addEventListener: (_: string, l: typeof reduceListener) => (reduceListener = l),
      removeEventListener: () => {},
    }));
    Object.assign(HTMLMediaElement.prototype, { play, pause, load });
  });
  afterEach(() => {
    cleanup(); // unmount (cancelIdleCallback) before the stubs go
    vi.unstubAllGlobals();
  });

  const props = { poster: "/hero/hero-br-poster.jpg", mp4: "/hero/hero-br.mp4", webm: "/hero/hero-br.webm" };
  const video = () => screen.getByTestId("hero-clip").querySelector("video")!;
  const sources = () => [...video().querySelectorAll("source")].map((s) => s.getAttribute("src"));

  it("renders the poster only, decorative, with no sources before idle + in view", () => {
    render(<HeroClip {...props} />);
    expect(screen.getByTestId("hero-clip").getAttribute("aria-hidden")).toBe("true");
    // A lazy <img>, not the eager poster attribute (mobile LCP).
    const img = screen.getByTestId("hero-clip").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(props.poster);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("alt")).toBe("");
    expect(video().hasAttribute("poster")).toBe(false);
    expect(video().getAttribute("preload")).toBe("none");
    expect(video().hasAttribute("controls")).toBe(false);
    expect(video().muted).toBe(true);
    expect(sources()).toEqual([]);
    act(() => idleCb!()); // idle but not in view yet
    expect(sources()).toEqual([]);
  });

  it("loads (mp4 first) once idle and in view, pauses off screen, resumes in view", () => {
    render(<HeroClip {...props} />);
    act(() => ioCb([{ isIntersecting: true }]));
    expect(sources()).toEqual([]);
    act(() => idleCb!());
    expect(sources()).toEqual([props.mp4, props.webm]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalled();
    act(() => ioCb([{ isIntersecting: false }]));
    expect(pause).toHaveBeenCalled();
    play.mockClear();
    act(() => ioCb([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never loads with reduced motion", () => {
    reduce = true;
    render(<HeroClip {...props} />);
    expect(idleCb).toBeNull();
    expect(sources()).toEqual([]);
    expect(play).not.toHaveBeenCalled();
  });

  it("stops for good when reduced motion is turned on mid-play", () => {
    render(<HeroClip {...props} />);
    act(() => ioCb([{ isIntersecting: true }]));
    act(() => idleCb!());
    act(() => reduceListener!({ matches: true }));
    expect(pause).toHaveBeenCalled();
    play.mockClear();
    act(() => ioCb([{ isIntersecting: false }]));
    act(() => ioCb([{ isIntersecting: true }]));
    expect(play).not.toHaveBeenCalled();
  });
});
