import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildAll, parseBatch } from "../../scripts/help-build.mjs";
import json from "@/content/helpArticles.json";
import { articleTitle, findArticle, helpLang, inlineSegments, searchHelp, webScreen, HELP } from "@/lib/help";

describe("Help Center content", () => {
  it("src/content/helpArticles.json is up to date with content/help/*.md (run npm run help:build)", () => {
    expect(buildAll(resolve(__dirname, "../../content/help"))).toEqual(json);
  });

  it("every article has pt-BR and en text, and a web note in both languages when it has one", () => {
    for (const c of HELP) {
      for (const a of c.articles) {
        expect(a.body.pt.length).toBeGreaterThan(0);
        expect(a.body.en.length).toBeGreaterThan(0);
        if (a.web) expect(a.web.pt && a.web.en).toBeTruthy();
      }
    }
  });

  it("the parser refuses malformed articles instead of publishing them", () => {
    expect(() => parseBatch("01-agenda", "## A1. Só português\n**pt-BR**\nTexto\n")).toThrow(/title/);
    expect(() => parseBatch("01-agenda", "## A1. Um / One\n**pt-BR**\nTexto\n`open:x`\n")).toThrow(/missing/);
    expect(() => parseBatch("01-agenda", "## A1. Um / One\n**pt-BR**\nT\n**en**\nT\n**No site:** só pt\n")).toThrow(/both/);
    expect(() => parseBatch("99-x", "")).toThrow(/unknown/);
  });
});

// Text that isn't true yet (an app build not released, a migration not
// applied, SolvyAI not live) never reaches the built JSON: no page, list,
// search, app view, SolvyAI knowledge or bundle has it (content/help/
// conditions.json; the App Map uses the same ids).
describe("conditions: held text is left out of the build", () => {
  const md = (extra: string, para = "") =>
    `## Z1. Um / One\n**pt-BR**\nTexto\n${para}\n**en**\nText\n${extra}\n`;
  const c = (met: boolean) => ({ x: { met, what: "test" } });

  it("an article that requires an unmet condition isn't built at all", () => {
    expect(parseBatch("05-conta", md("`requires:x`"), c(false)).articles).toEqual([]);
    expect(parseBatch("05-conta", md("`requires:x`"), c(true)).articles.map((a) => a.id)).toEqual(["Z1"]);
  });

  it("a pending paragraph appears only when its condition is met, without the marker", () => {
    const off = parseBatch("05-conta", md("", "{pending:x} Held"), c(false)).articles[0];
    expect(JSON.stringify(off)).not.toContain("Held");
    const on = parseBatch("05-conta", md("", "{pending:x} Held"), c(true)).articles[0];
    expect(JSON.stringify(on.body.pt)).toContain("Held");
    expect(JSON.stringify(on)).not.toContain("{pending");
  });

  it("an unknown condition id fails the build (a typo can't hide or show text)", () => {
    expect(() => parseBatch("05-conta", md("`requires:typo`"), c(true))).toThrow(/unknown condition "typo"/);
    expect(() => parseBatch("05-conta", md("", "{pending:typo} T"), c(true))).toThrow(/unknown condition "typo"/);
    // A typo in a later id fails too, even when the first is unmet (7f).
    expect(() => parseBatch("05-conta", md("", "{pending:x,typo} T"), c(false))).toThrow(/unknown condition "typo"/);
  });

  it("{pending:a,b}: the paragraph only when every condition is met", () => {
    const two = (a: boolean, b: boolean) => ({ x: { met: a, what: "t" }, y: { met: b, what: "t" } });
    for (const [a, b, shown] of [[true, true, true], [true, false, false], [false, true, false]] as const) {
      const art = parseBatch("05-conta", md("", "{pending:x,y} Both"), two(a, b)).articles[0];
      expect(JSON.stringify(art.body.pt).includes("Both")).toBe(shown);
    }
  });

  it("the real build has no markers, and the held A1 sentence is out while mobile #91 isn't released", () => {
    const text = JSON.stringify(json);
    expect(text).not.toMatch(/\{pending:|`requires:/);
    const conditions = JSON.parse(readFileSync(resolve(__dirname, "../../content/help/conditions.json"), "utf8"));
    const a1 = JSON.stringify(findArticle("a1")!.article);
    if (conditions["mobile#91"].met) expect(a1).toContain("Outside the working hours");
    else expect(a1).not.toContain("Outside the working hours");
  });

  it("C9 (SolvyAI) is truly absent until SolvyAI is live: no page, list, search or app view", () => {
    const conditions = JSON.parse(readFileSync(resolve(__dirname, "../../content/help/conditions.json"), "utf8"));
    if (conditions["solvyai-live"].met) return;
    // /help/c9 (plain or ?app=1) → notFound(): the page looks it up here.
    expect(findArticle("c9")).toBeNull();
    expect(HELP.flatMap((c) => c.articles).map((a) => a.id)).not.toContain("C9");
    for (const lang of ["pt", "en"] as const) {
      for (const app of [false, true]) expect(searchHelp("SolvyAI", lang, app).map((a) => a.id)).not.toContain("C9");
    }
    // Nothing of it in the built data (so not in any bundle or SolvyAI's knowledge).
    expect(JSON.stringify(json)).not.toMatch(/Anthropic|Permitir que o SolvyAI/);
  });

  it("every condition says what 'met' means; app ones mean a RELEASED build", () => {
    const conditions = JSON.parse(readFileSync(resolve(__dirname, "../../content/help/conditions.json"), "utf8"));
    for (const [id, v] of Object.entries(conditions) as [string, { met: unknown; what: string }][]) {
      expect(typeof v.met, id).toBe("boolean");
      expect(v.what.length, id).toBeGreaterThan(20);
      if (id.startsWith("mobile#")) expect(v.what, id).toMatch(/RELEASED/);
    }
  });
});

describe("the app-opened variant (store rules)", () => {
  it("K1 (subscription) has the store-safe text for the apps", () => {
    const k1 = findArticle("k1")!.article;
    expect(k1.appOnly).toEqual({ pt: "Veja os detalhes da sua conta em Configurações.", en: "See your account details in Settings." });
  });

  it("search in the app variant never surfaces the subscribing text", () => {
    expect(searchHelp("assine", "pt", false).map((a) => a.id)).toContain("K1");
    expect(searchHelp("assine", "pt", true).map((a) => a.id)).not.toContain("K1");
  });

  it("K1 has a neutral title in the apps (no 'assinatura')", () => {
    const k1 = findArticle("k1")!.article;
    expect(articleTitle(k1, "pt", true)).toBe("Sua conta");
    expect(articleTitle(k1, "en", true)).toBe("Your account");
    expect(articleTitle(k1, "pt", false)).toBe("Teste grátis e assinatura");
    expect(searchHelp("assinatura", "pt", true).map((a) => a.id)).not.toContain("K1");
  });

  it("the app variant searches only what it shows: never the web notes", () => {
    // "Visão geral" appears only in web notes (the web's name for Home).
    expect(searchHelp("visao geral", "pt", false).length).toBeGreaterThan(0);
    expect(searchHelp("visao geral", "pt", true)).toEqual([]);
  });
});

describe("Open on the website", () => {
  it("is hidden where the web note says the website doesn't have it", () => {
    const flagged = HELP.flatMap((c) => c.articles).filter((a) => a.webUnavailable).map((a) => a.id);
    // A2 (recurring) is on the website too now.
    expect(flagged).toEqual(["P7", "P8", "P10", "G5", "C6", "C7"]);
    // A4 (move and cancel) is on the website: it keeps the button.
    expect(findArticle("a4")!.article.webUnavailable).toBe(false);
  });
});

describe("helpers", () => {
  it("helpLang: pt-BR, else English", () => {
    expect(helpLang("pt-BR")).toBe("pt");
    expect(helpLang("en")).toBe("en");
    expect(helpLang("th")).toBe("en");
  });

  it("inline bold, everything else plain", () => {
    expect(inlineSegments("Toque em **Salvar** agora")).toEqual([
      { bold: false, text: "Toque em " },
      { bold: true, text: "Salvar" },
      { bold: false, text: " agora" },
    ]);
  });

  it("search ignores accents and case, and needs every word", () => {
    expect(searchHelp("BLOQUEAR horario", "pt", false).map((a) => a.id)).toContain("A3");
    expect(searchHelp("xyzzy", "pt", false)).toEqual([]);
  });

  it("web screens for deep links; none for app-only screens", () => {
    expect(webScreen("schedule")).toBe("/dashboard/schedule");
    expect(webScreen("settings-security")).toBeNull();
    expect(webScreen(null)).toBeNull();
  });
});
