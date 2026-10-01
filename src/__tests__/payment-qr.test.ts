import { describe, expect, it } from "vitest";
import { offersPaymentQr } from "@/lib/scheduleChecks";

// The app regression's B7 (app #214), the same rule on the web's Agenda: a
// paid appointment never offers the Pix / PromptPay QR (no paying twice).
describe("offersPaymentQr", () => {
  it("an unpaid appointment offers it; a paid one or blocked time never", () => {
    expect(offersPaymentQr({ status: "scheduled", payment_status: "pending" })).toBe(true);
    expect(offersPaymentQr({ status: "completed", payment_status: null })).toBe(true);
    expect(offersPaymentQr({ status: "scheduled", payment_status: "paid" })).toBe(false);
    expect(offersPaymentQr({ status: "completed", payment_status: "paid" })).toBe(false);
    expect(offersPaymentQr({ status: "blocked", payment_status: null })).toBe(false);
  });
});
