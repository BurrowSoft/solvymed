import { describe, expect, it } from "vitest";
import { doctorForPush } from "@/lib/pushDoctor";

// "Always say who" in patient pushes (app #290): the doctor's name as set,
// else the clinic's, else "SolvyMed"; a secretary reads the public info.
function db(own: Record<string, unknown> | null, pub: Record<string, unknown> | null = null, fail = false) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { if (fail) throw new Error("x"); return { data: own }; } }) }) }),
    rpc: async () => ({ data: pub ? [pub] : [], error: null }),
  } as never;
}

describe("doctorForPush", () => {
  it("the name as set (title included), else the clinic, else SolvyMed", async () => {
    expect(await doctorForPush(db({ full_name: " Dra. Ana Souza ", clinic_name: "Clínica Sol" }), "d")).toBe("Dra. Ana Souza");
    expect(await doctorForPush(db({ full_name: "", clinic_name: "Clínica Sol" }), "d")).toBe("Clínica Sol");
    expect(await doctorForPush(db({ full_name: null, clinic_name: null }), "d")).toBe("SolvyMed");
  });

  it("a secretary (no doctor row): the practice's public info", async () => {
    expect(await doctorForPush(db(null, { full_name: "Dr. Público", clinic_name: "X" }), "d")).toBe("Dr. Público");
  });

  it("never empty, never throws", async () => {
    expect(await doctorForPush(db(null, null, true), "d")).toBe("SolvyMed");
    expect(await doctorForPush(db(null), null)).toBe("SolvyMed");
  });
});
