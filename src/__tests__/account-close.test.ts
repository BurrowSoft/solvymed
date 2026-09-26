import { describe, it, expect } from "vitest";
import { closeFailureCode, planClosureNotices, stripeCloseStep, type ClosureRow } from "@/lib/accountClose";

const stripeProf = { subscription_status: "active", subscription_provider: "stripe", subscription_id: "sub_1" };

describe("stripeCloseStep", () => {
  it("cancels the professional's own live subscription", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete"]) {
      expect(stripeCloseStep("u1", stripeProf, { id: "sub_1", status, metadata: { user_id: "u1" } }))
        .toEqual({ kind: "cancel", subId: "sub_1" });
    }
  });

  it("treats a subscription already over in Stripe as done", () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(stripeCloseStep("u1", stripeProf, { id: "sub_1", status, metadata: { user_id: "u1" } }))
        .toEqual({ kind: "ended", subId: "sub_1" });
    }
  });

  it("never touches Stripe for lifetime, trial-only or unknown subscriptions", () => {
    const live = { id: "sub_1", status: "active", metadata: { user_id: "u1" } };
    expect(stripeCloseStep("u1", { ...stripeProf, subscription_status: "lifetime" }, live)).toEqual({ kind: "none" });
    expect(stripeCloseStep("u1", { subscription_status: "trial", subscription_provider: null, subscription_id: null }, null))
      .toEqual({ kind: "none" });
    expect(stripeCloseStep("u1", stripeProf, null)).toEqual({ kind: "none" });
    expect(stripeCloseStep("u1", null, null)).toEqual({ kind: "none" });
  });

  it("refuses to cancel a subscription that belongs to someone else", () => {
    expect(stripeCloseStep("u1", stripeProf, { id: "sub_1", status: "active", metadata: { user_id: "u2" } }))
      .toEqual({ kind: "not_owner" });
    expect(stripeCloseStep("u1", stripeProf, { id: "sub_1", status: "active" })).toEqual({ kind: "not_owner" });
  });
});

describe("closeFailureCode", () => {
  it("tells the professional when the subscription is gone but the account isn't closed", () => {
    expect(closeFailureCode({ kind: "cancel", subId: "sub_1" }, null)).toBe("cancelled_not_closed");
    expect(closeFailureCode({ kind: "ended", subId: "sub_1" }, null)).toBe("cancelled_not_closed");
    expect(closeFailureCode({ kind: "none" }, null)).toBe("generic");
    // A cancelled subscription is reported even if the guard also fired.
    expect(closeFailureCode({ kind: "cancel", subId: "sub_1" }, "subscription_active")).toBe("cancelled_not_closed");
    expect(closeFailureCode({ kind: "none" }, "subscription_active")).toBe("subscription_active");
  });

  it("a retry after a cancel skips Stripe: the subscription is already over", () => {
    // First attempt cancelled sub_1 and the close failed. On retry Stripe
    // reports it canceled, so the route doesn't cancel again and goes
    // straight to close_my_account().
    const retry = stripeCloseStep("u1", { ...stripeProf, subscription_status: "expired" },
      { id: "sub_1", status: "canceled", metadata: { user_id: "u1" } });
    expect(retry).toEqual({ kind: "ended", subId: "sub_1" });
  });
});

describe("planClosureNotices", () => {
  const row = (r: Partial<ClosureRow>): ClosureRow => ({
    outcome: "closed", kind: "none", patient_auth_id: null, appointment_id: null, date: null, start_time: null, ...r,
  });

  it("sends one notice per person: linked patients get 'clinic closed', others get the cancellation", () => {
    const plan = planClosureNotices([
      row({ kind: "linked_patient", patient_auth_id: "p1" }),
      row({ kind: "cancelled_appointment", patient_auth_id: "p1", appointment_id: "a1", date: "2026-10-01", start_time: "09:00" }),
      row({ kind: "cancelled_appointment", patient_auth_id: "p2", appointment_id: "a2", date: "2026-10-02", start_time: "10:00" }),
      row({ kind: "cancelled_appointment", patient_auth_id: null, appointment_id: "a3", date: "2026-10-03", start_time: "11:00" }),
    ]);
    expect(plan.linkedPatients).toEqual(["p1"]);
    expect(plan.cancelledAppointments).toEqual([
      { patientAuthId: "p2", appointmentId: "a2", date: "2026-10-02", startTime: "10:00" },
    ]);
  });

  it("has nothing to send for a deleted account", () => {
    expect(planClosureNotices([row({ outcome: "deleted" })])).toEqual({ linkedPatients: [], cancelledAppointments: [] });
  });
});
