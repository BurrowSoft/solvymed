import { describe, expect, it } from "vitest";
import { offersPaymentQr } from "@/lib/scheduleChecks";

// The app regression's B7 (app #214), the same rule on the web's Agenda: a
// paid appointment never offers the Pix / PromptPay QR (no paying twice);
// nor one without an amount (e7: "Definir valor" first).
describe("offersPaymentQr", () => {
  it("an unpaid appointment with an amount offers it; a paid one or blocked time never", () => {
    expect(offersPaymentQr({ status: "scheduled", payment_status: "pending", payment_amount: 150 })).toBe(true);
    expect(offersPaymentQr({ status: "completed", payment_status: null, payment_amount: 90 })).toBe(true);
    expect(offersPaymentQr({ status: "scheduled", payment_status: "paid", payment_amount: 150 })).toBe(false);
    expect(offersPaymentQr({ status: "completed", payment_status: "paid", payment_amount: 150 })).toBe(false);
    expect(offersPaymentQr({ status: "blocked", payment_status: null, payment_amount: 150 })).toBe(false);
  });

  it("no amount (none or zero): no QR", () => {
    expect(offersPaymentQr({ status: "scheduled", payment_status: "pending" })).toBe(false);
    expect(offersPaymentQr({ status: "scheduled", payment_status: "pending", payment_amount: null })).toBe(false);
    expect(offersPaymentQr({ status: "scheduled", payment_status: "pending", payment_amount: 0 })).toBe(false);
  });
});
