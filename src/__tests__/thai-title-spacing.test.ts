import { describe, expect, it } from "vitest";
import { doctorDisplayName, withBrandTitle } from "@/lib/doctorName";
import { loadSelfFieldPrompts } from "@/lib/selfFields";

// 01 (10-29): a Thai title against the name wherever a doctor's name is shown
// ("พญ.ณัฐธิดา", lib/doctorName), also where pages used the typed name as-is:
// the Patient Channel page (with My brand's title, put in front once), its
// settings preview, the booking page, pending confirmation, clinic inactive and
// the complete-your-registration card. Idempotent on an already shown name.
describe("Thai title spacing", () => {
  it.each([
    ["พญ. ณัฐธิดา ใจดี", "พญ.ณัฐธิดา ใจดี"],
    ["พญ.ณัฐธิดา ใจดี", "พญ.ณัฐธิดา ใจดี"],
    ["นพ สมชาย", "นพ.สมชาย"],
    ["Dra. Ana Lima", "Dra. Ana Lima"],
  ])("%s → %s", (typed, shown) => {
    expect(doctorDisplayName(typed)).toBe(shown);
    expect(doctorDisplayName(doctorDisplayName(typed))).toBe(shown);
  });

  it("the channel page's name: My brand's title once, against a Thai name", () => {
    const pcName = (title: string | null, name: string) => doctorDisplayName(withBrandTitle(title, name));
    expect(pcName("พญ.", "ณัฐธิดา ใจดี")).toBe("พญ.ณัฐธิดา ใจดี");
    expect(pcName("พญ.", "พญ. ณัฐธิดา ใจดี")).toBe("พญ.ณัฐธิดา ใจดี");
    expect(pcName(null, "พญ. ณัฐธิดา ใจดี")).toBe("พญ.ณัฐธิดา ใจดี");
    expect(pcName("Dra.", "Ana Lima")).toBe("Dra. Ana Lima");
  });

  it("the complete-your-registration card names the doctor the same way", async () => {
    const db = { rpc: async () => ({ data: { country: "TH", keys: ["email"], prefill: {} }, error: null }) };
    const out = await loadSelfFieldPrompts(db, [{ id: "a", name: "พญ. ณัฐธิดา ใจดี" }]);
    expect(out[0].doctorName).toBe("พญ.ณัฐธิดา ใจดี");
  });
});
