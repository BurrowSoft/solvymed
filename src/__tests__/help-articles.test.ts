import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildAll, parseBatch } from "../../scripts/help-build.mjs";
import json from "@/content/helpArticles.json";
import { findArticle, helpLang, inlineSegments, searchHelp, webScreen, HELP } from "@/lib/help";

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

describe("the app-opened variant (store rules)", () => {
  it("K1 (subscription) has the store-safe text for the apps", () => {
    const k1 = findArticle("k1")!.article;
    expect(k1.appOnly).toEqual({ pt: "Veja os detalhes da sua conta em Configurações.", en: "See your account details in Settings." });
  });

  it("search in the app variant never surfaces the subscribing text", () => {
    expect(searchHelp("assine", "pt", false).map((a) => a.id)).toContain("K1");
    expect(searchHelp("assine", "pt", true).map((a) => a.id)).not.toContain("K1");
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
