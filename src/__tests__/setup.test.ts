import { describe, it, expect } from "vitest";
import { getSetupProgress, showChecklist, type SetupProgress } from "@/lib/setup";

const base: SetupProgress = {
  profile_done: false, hours_done: false, procedure_done: false, patient_done: false,
  appointment_done: false, invite_shared: false, setup_hidden: false, completed_ack: false, done_count: 0,
};

describe("first-run checklist visibility", () => {
  it("shows until hidden or acknowledged; never without progress", () => {
    expect(showChecklist(base)).toBe(true);
    expect(showChecklist({ ...base, done_count: 6 })).toBe(true); // the one-time "ready" message
    expect(showChecklist({ ...base, setup_hidden: true })).toBe(false);
    expect(showChecklist({ ...base, done_count: 6, completed_ack: true })).toBe(false);
    expect(showChecklist(null)).toBe(false);
  });

  it("treats an RPC error (e.g. before migration 103, or not a professional) as no card", async () => {
    const failing = { rpc: async () => ({ data: null, error: { message: "not_a_professional" } }) };
    expect(await getSetupProgress(failing)).toBeNull();
    const ok = { rpc: async () => ({ data: [{ ...base, done_count: 2 }], error: null }) };
    expect((await getSetupProgress(ok))?.done_count).toBe(2);
  });
});
