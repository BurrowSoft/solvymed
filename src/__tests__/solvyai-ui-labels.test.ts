import { describe, expect, it } from "vitest";
import { labelGlossary, labelMap, localizeLabels } from "@/lib/assistant/server/uiLabels";
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

// d7 ❌ (#247): the model copied the invite article's English **labels**
// despite the list; the text it reads now has them in the user's language.
describe("localizeLabels", () => {
  it("rewrites bold labels and screen paths part by part; unknown parts stay", () => {
    const map = labelMap("th", th as unknown as typeof en);
    const web = "In the **Schedule**, click **Share invite link**, or in **Settings → Your invite code**, use **Copy** or **Copy link**. **Regenerate** creates a new code.";
    const out = localizeLabels(web, map);
    expect(out).toContain(`**${th.nav.schedule}**`);
    expect(out).toContain(`**${th.nav.settings} → ${th.settings.inviteCodeTitle}**`);
    expect(out).toContain(`**${th.settings.copy}**`);
    expect(out).toContain(`**${th.settings.copyLink}**`);
    expect(out).toContain(`**${th.settings.regenerate}**`);
    expect(out).not.toMatch(/\*\*(Schedule|Settings|Copy|Regenerate)/);
    expect(localizeLabels("**Nowhere → Settings**", map)).toBe(`**Nowhere → ${th.nav.settings}**`);
    expect(localizeLabels('Screen: app "Schedule › +", web "Schedule › New appointment".', map)).toContain(`web "${th.nav.schedule} › `);
  });

  it("the Thai prompt's Help text names the Thai labels; en/pt are untouched", async () => {
    const { cachedSystem } = await import("@/lib/assistant/server/knowledge");
    const { loadTexts } = await import("@/lib/assistant/server/texts");
    const thPrefix = cachedSystem("en", "web", (await loadTexts("th")).reply);
    expect(thPrefix).toContain(`**${th.nav.settings} → ${th.settings.inviteCodeTitle}**`);
    expect(thPrefix).not.toContain("**Settings → Your invite code**");
    expect(cachedSystem("en", "web", (await loadTexts("en")).reply)).toContain("**Settings → Your invite code**");
  });
});
