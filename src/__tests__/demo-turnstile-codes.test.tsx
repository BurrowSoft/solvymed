import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The demo's bot check reports every way it can stop (the mobile developer, 10-26: the
// app's verify page sat on "Verificando…" in a WebView with no callback): Turnstile's
// timeout and unsupported callbacks, and with stallMs a stall while nothing happened.

vi.mock("@/components/TurnstileWidget", () => ({ loadTurnstileScript: () => Promise.resolve() }));

import { DemoTurnstile } from "@/components/DemoTurnstile";

let opts: Record<string, (...a: unknown[]) => void> = {};
beforeEach(() => {
  vi.useFakeTimers();
  opts = {};
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: (_el: HTMLElement, o: Record<string, (...a: unknown[]) => void>) => { opts = o; return "w1"; },
    remove: () => {},
  };
});
afterEach(() => vi.useRealTimers());

const mount = async (stallMs?: number) => {
  const onToken = vi.fn();
  const onError = vi.fn();
  render(<DemoTurnstile siteKey="k" locale="pt-BR" onToken={onToken} onError={onError} stallMs={stallMs} />);
  await act(async () => { await Promise.resolve(); });
  return { onToken, onError };
};

describe("DemoTurnstile's codes", () => {
  it("timeout and unsupported are reported", async () => {
    const { onError } = await mount();
    act(() => opts["timeout-callback"]());
    act(() => opts["unsupported-callback"]());
    expect(onError.mock.calls).toEqual([["timeout"], ["unsupported"]]);
  });

  it("with stallMs: no answer at all → stalled", async () => {
    const { onError } = await mount(15000);
    act(() => { vi.advanceTimersByTime(15000); });
    expect(onError).toHaveBeenCalledWith("stalled");
  });

  it("a challenge shown or a token stops the stall timer", async () => {
    const shown = await mount(15000);
    act(() => opts["before-interactive-callback"]());
    act(() => { vi.advanceTimersByTime(60000); });
    expect(shown.onError).not.toHaveBeenCalled();
    const done = await mount(15000);
    act(() => opts.callback("tok"));
    act(() => { vi.advanceTimersByTime(60000); });
    expect(done.onToken).toHaveBeenCalledWith("tok");
    expect(done.onError).not.toHaveBeenCalled();
  });

  it("without stallMs (the website's /demo) there is no stall timer", async () => {
    const { onError } = await mount();
    act(() => { vi.advanceTimersByTime(120000); });
    expect(onError).not.toHaveBeenCalled();
  });

  it("the app's verify page uses the stall timer", () => {
    const src = readFileSync(resolve(__dirname, "../app/[locale]/(site)/demo/verify-app/VerifyAppClient.tsx"), "utf8");
    expect(src).toContain("stallMs={STALL_MS}");
    expect(src).toContain("export const STALL_MS = 15000;");
  });
});
