import { describe, it, expect } from "vitest";
import { trialChipMessage } from "@/components/TrialChip";

describe("trialChipMessage", () => {
  it("says 'See plan' while more than 3 days are left", () => {
    expect(trialChipMessage(14)).toEqual({ key: "chipDays", n: 14 });
    expect(trialChipMessage(4)).toEqual({ key: "chipDays", n: 4 });
  });

  it("says 'Subscribe' at 3 days or fewer, and 'last day' at 1", () => {
    expect(trialChipMessage(3)).toEqual({ key: "chipUrgentDays", n: 3 });
    expect(trialChipMessage(2)).toEqual({ key: "chipUrgentDays", n: 2 });
    expect(trialChipMessage(1)).toEqual({ key: "chipLastDay", n: 1 });
  });
});
