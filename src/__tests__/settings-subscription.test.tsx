import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { planSummary, type EffectiveSub } from "@/lib/subscription";
import { SubscriptionPanel } from "@/app/[locale]/dashboard/settings/SubscriptionPanel";

// Settings → Subscription (UX 36): an active subscriber gets a way into
// the Stripe portal, returning to Settings.

const day = 86_400_000;
const sub = (over: Partial<EffectiveSub>) => ({ subscription_status: "trial", trial_ends_at: null, current_period_end: null, ...over }) as EffectiveSub;

describe("planSummary", () => {
  it("names the plan's state", () => {
    expect(planSummary(null)).toBeNull();
    expect(planSummary(sub({ subscription_status: "active", current_period_end: new Date(Date.now() + day).toISOString() }))).toEqual({ kind: "active" });
    expect(planSummary(sub({ subscription_status: "active", current_period_end: new Date(Date.now() - day).toISOString() }))).toEqual({ kind: "inactive" });
    expect(planSummary(sub({ subscription_status: "lifetime" }))).toEqual({ kind: "lifetime" });
    expect(planSummary(sub({ trial_ends_at: new Date(Date.now() + 2.5 * day).toISOString() }))).toEqual({ kind: "trial", daysLeft: 3 });
    expect(planSummary(sub({ trial_ends_at: new Date(Date.now() - day).toISOString() }))).toEqual({ kind: "inactive" });
    expect(planSummary(sub({ subscription_status: "expired" }))).toEqual({ kind: "inactive" });
  });
});

describe("SubscriptionPanel", () => {
  const show = (plan: Parameters<typeof SubscriptionPanel>[0]["plan"], canManage: boolean) =>
    render(<NextIntlClientProvider locale="en" messages={en}><SubscriptionPanel plan={plan} canManage={canManage} locale="pt-BR" /></NextIntlClientProvider>);
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

  it("an active Stripe subscriber can open the portal, back to Settings", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ code: "portal_unavailable" }) });
    show({ kind: "active" }, true);
    expect(screen.getByText("Pro plan · active")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/portal", expect.objectContaining({ body: JSON.stringify({ locale: "pt-BR", returnTo: "settings" }) }));
    expect(await screen.findByText(en.subscription.portalUnavailable)).toBeTruthy();
  });

  it("a trial shows the days left and the plan link, no portal", () => {
    show({ kind: "trial", daysLeft: 1 }, false);
    expect(screen.getByText("Free trial: 1 day left")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "See the plan" }).getAttribute("href")).toBe("/pt-BR/subscribe");
  });

  it("a lifetime plan offers nothing to buy or manage", () => {
    show({ kind: "lifetime" }, false);
    expect(screen.getByText("Pro plan · lifetime")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
