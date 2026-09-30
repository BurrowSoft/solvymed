import { describe, expect, it } from "vitest";
import { labelGlossary } from "@/lib/assistant/server/uiLabels";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// d7/UX: the Help and App Map are pt/en; a Thai answer must name the
// screens with the Thai labels.
describe("labelGlossary", () => {
  it("maps the labels the Help/App Map name to the user's language", () => {
    const g = labelGlossary("th", th as unknown as typeof en);
    expect(g).toContain(`"Settings" = "${th.nav.settings}"`);
    expect(g).toContain(`"Schedule" = "${th.nav.schedule}"`);
    expect(g.length).toBeGreaterThan(10);
    expect(g.every((p) => /^".+" = ".+"$/.test(p))).toBe(true);
  });

  it("nothing for pt/en (the articles already use them)", () => {
    expect(labelGlossary("en", en)).toEqual([]);
    expect(labelGlossary("pt-BR", en)).toEqual([]);
  });
});
