import { describe, expect, it } from "vitest";
import { isReceivable, RECEIVABLE_STATUSES } from "@/lib/paymentRules";

// The shared table with the app: does an appointment count in "Pendente"?
export const PENDING_RULE_TABLE: [status: string, paymentStatus: string, counts: boolean][] = [
  ["scheduled", "pending", true],
  ["confirmed", "pending", true],
  ["completed", "pending", true],
  ["late", "pending", true],
  ["tentative", "pending", false], // a patient's request not yet accepted
  ["proposal", "pending", false], // a new time proposed, not yet accepted
  ["cancelled", "pending", false],
  ["rejected", "pending", false],
  ["absent", "pending", false], // no-show
  ["blocked", "pending", false],
  ["scheduled", "paid", false], // already received
  ["completed", "paid", false],
];

describe("Pendente (to receive): the app's rule", () => {
  it.each(PENDING_RULE_TABLE)("%s / %s → %s", (status, paymentStatus, counts) => {
    expect(isReceivable(status, paymentStatus)).toBe(counts);
  });

  it("the query filter lists exactly the counted statuses", () => {
    expect([...RECEIVABLE_STATUSES].sort()).toEqual(["completed", "confirmed", "late", "scheduled"]);
  });
});
