import { describe, expect, it } from "vitest";
import { loadTexts } from "@/lib/assistant/server/texts";
import { isChipTap } from "@/lib/assistant/server/tools";

// UX (5 Oct): SolvyAI's visit dates (cards, time chips) are in the PRACTICE's
// calendar, in the reader's words, no era; a tapped chip still matches.
describe("SolvyAI visit dates", () => {
  it("a TH clinic's chip for a pt reader: 2569; the tapped text is recognised", async () => {
    const t = await loadTexts("pt-BR");
    const chip = t.chipAt("2026-10-07", "10:00", "buddhist");
    expect(chip).toContain("07/10/2569");
    expect(chip).not.toMatch(/BE|E\.B\./);
    expect(isChipTap({ t, userText: chip, country: "TH" }, "2026-10-07", "10:00")).toBe(true);
    expect(isChipTap({ t, userText: t.chipAt("2026-10-07", "10:00"), country: "TH" }, "2026-10-07", "10:00")).toBe(false);
  });

  it("a BR clinic's chip for a Thai reader: Gregorian", async () => {
    const t = await loadTexts("th");
    expect(t.chipAt("2026-10-07", "10:00", "gregorian")).toContain("07/10/2026");
    expect(isChipTap({ t, userText: t.chipAt("2026-10-07", "10:00", "gregorian"), country: "BR" }, "2026-10-07", "10:00")).toBe(true);
  });
});
