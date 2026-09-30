import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { isPaidActive, type EffectiveSub } from "@/lib/subscription";

// /subscribe?success=1 says "activated" only once the database says so
// (web tester 2: the webhook never landed, the page claimed it anyway).

const h = vi.hoisted(() => ({ answers: [] as boolean[], pushed: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (u: string) => h.pushed.push(u) }) }));
vi.mock("@/app/[locale]/(site)/subscribe/actions", () => ({
  isSubscriptionActive: async () => h.answers.shift() ?? false,
}));

import { ActivationStatus } from "@/app/[locale]/(site)/subscribe/ActivationStatus";

const sub = (over: Partial<EffectiveSub>) => ({ subscription_status: "trial", trial_ends_at: null, current_period_end: null, ...over }) as EffectiveSub;

describe("isPaidActive", () => {
  it("is only a paid plan that's on", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isPaidActive(null)).toBe(false);
    expect(isPaidActive(sub({ subscription_status: "trial", trial_ends_at: future }))).toBe(false);
    expect(isPaidActive(sub({ subscription_status: "active", current_period_end: future }))).toBe(true);
    expect(isPaidActive(sub({ subscription_status: "active", current_period_end: past }))).toBe(false);
    expect(isPaidActive(sub({ subscription_status: "lifetime" }))).toBe(true);
    expect(isPaidActive(sub({ subscription_status: "expired" }))).toBe(false);
  });
});

describe("ActivationStatus", () => {
  beforeEach(() => { vi.useFakeTimers(); h.answers = []; h.pushed = []; });
  afterEach(() => { vi.useRealTimers(); });
  const show = (initiallyActive: boolean, canGoBack = true) =>
    render(<NextIntlClientProvider locale="en" messages={en}><ActivationStatus initiallyActive={initiallyActive} dashboardHref="/pt-BR/dashboard" canGoBack={canGoBack} /></NextIntlClientProvider>);
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it("says activated right away when it already is", () => {
    show(true);
    expect(screen.getByRole("status").textContent).toBe(en.subscription.successMessage);
  });

  it("waits, then says activated when the database does", async () => {
    h.answers = [false, false, true];
    show(false);
    expect(screen.getByRole("status").textContent).toContain(en.subscription.activationPending);
    await tick(4000);
    expect(screen.getByRole("status").textContent).toContain(en.subscription.activationPending);
    await tick(2000);
    expect(screen.getByRole("status").textContent).toBe(en.subscription.successMessage);
  });

  it("never claims it on a timeout: it says it's slow, with support", async () => {
    show(false);
    await tick(31000);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(en.subscription.activationSlow);
    expect(status.textContent).not.toContain(en.subscription.successMessage);
    expect(status.querySelector("a")?.getAttribute("href")).toBe("mailto:support@solvymed.com");
    // A way back while it's slow (Vitor: the page had no exit).
    expect(screen.getByText(en.subscription.backToDashboard).getAttribute("href")).toBe("/pt-BR/dashboard");
  });

  it("while waiting: a way back to the dashboard", () => {
    show(false);
    expect(screen.getByText(en.subscription.backToDashboard).getAttribute("href")).toBe("/pt-BR/dashboard");
  });

  it("an ended trial waiting for the webhook gets no back link (the dashboard would bounce to the paywall)", async () => {
    show(false, false);
    expect(screen.queryByText(en.subscription.backToDashboard)).toBeNull();
    await tick(31000);
    expect(screen.queryByText(en.subscription.backToDashboard)).toBeNull();
  });

  it("once active: the Go to dashboard button, and the dashboard opens by itself after 3 s", async () => {
    show(true);
    expect(screen.getByText(en.subscription.goToDashboard).getAttribute("href")).toBe("/pt-BR/dashboard");
    expect(h.pushed).toEqual([]);
    await tick(3000);
    expect(h.pushed).toEqual(["/pt-BR/dashboard"]);
  });
});
