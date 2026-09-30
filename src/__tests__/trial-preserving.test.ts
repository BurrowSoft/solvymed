import { describe, expect, it } from "vitest";
import { KEEP_TRIAL_MIN_MS, checkoutTrialEnd, statusWhenSubscriptionDies, type EffectiveSub } from "@/lib/subscription";

// UX, 1 Oct: subscribing during the free trial keeps it (the first charge
// when it ends); cancelling before then gives the trial back, not "expired".

const now = Date.parse("2026-10-01T12:00:00Z");
const sub = (over: Partial<EffectiveSub>): EffectiveSub => ({
  subscription_status: "trial", trial_ends_at: null, current_period_end: null, subscription_provider: null, subscription_id: null, ...over,
});

describe("checkoutTrialEnd", () => {
  it("the trial end when a trial has more than 48 h left", () => {
    const end = "2026-10-10T12:00:00Z";
    expect(checkoutTrialEnd(sub({ trial_ends_at: end }), now)?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
  it("charge now: 48 h or less left, an ended trial, no trial, or already paying", () => {
    expect(checkoutTrialEnd(sub({ trial_ends_at: new Date(now + KEEP_TRIAL_MIN_MS).toISOString() }), now)).toBeNull();
    expect(checkoutTrialEnd(sub({ trial_ends_at: "2026-09-30T00:00:00Z" }), now)).toBeNull();
    expect(checkoutTrialEnd(sub({ subscription_status: "expired", trial_ends_at: "2026-10-10T12:00:00Z" }), now)).toBeNull();
    expect(checkoutTrialEnd(sub({ subscription_status: "active", trial_ends_at: "2026-10-10T12:00:00Z" }), now)).toBeNull();
    expect(checkoutTrialEnd(null, now)).toBeNull();
  });
});

describe("statusWhenSubscriptionDies", () => {
  it("back to trial while the doctor's own trial runs; expired after it", () => {
    expect(statusWhenSubscriptionDies("2026-10-10T12:00:00Z", now)).toBe("trial");
    expect(statusWhenSubscriptionDies("2026-09-30T12:00:00Z", now)).toBe("expired");
    expect(statusWhenSubscriptionDies(null, now)).toBe("expired");
  });
});
