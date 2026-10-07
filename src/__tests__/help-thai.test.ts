import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseBatch, readConditions } from "../../scripts/help-build.mjs";
import th from "@/messages/th.json";
import { HELP, helpData, helpView, thaiOverlay, type HelpCategory } from "@/lib/help";

// Thai Help (cf, 7 Oct): 15 drafted articles, hidden behind help-th-live
// until Vitor's first pass; labels from the th i18n strings.

const DIR = resolve("content/help");
const conditions = readConditions(DIR);
const files = readdirSync(DIR).filter((f) => /^\d\d-.+\.md$/.test(f)).sort();
const build = (met: boolean) => files.map((f) => parseBatch(f.replace(/\.md$/, ""), readFileSync(resolve(DIR, f), "utf8"), { ...conditions, "help-th-live": { ...conditions["help-th-live"], met } }));
// Live articles only (P16 / C15 have Thai drafts too, behind their features). C11: 1.8.0 (ad).
const DRAFTED = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "P1", "P2", "G1", "G2", "G4", "G5", "G6", "C4", "C11", "K2", "K3", "K4", "K5", "K6"];

type Built = { titleTh?: string; articles: { id: string; th?: { title: string; body: unknown[]; web: string | null } }[] }[];

describe("Thai Help", () => {
  it("hidden today: help-th-live off, no Thai in the JSON, Thai readers get English", () => {
    expect(conditions["help-th-live"].met).toBe(false);
    expect(HELP.some((c) => c.titleTh || c.articles.some((a) => a.th))).toBe(false);
    expect(helpView("th")).toBe("en");
    expect(helpView("pt-BR")).toBe("pt");
    for (const c of build(false) as Built) for (const a of c.articles) expect(a.th).toBeUndefined();
  });

  it("once live: the drafted live articles carry a Thai title and text; the categories a Thai name", () => {
    const cats = build(true) as Built;
    const withTh = cats.flatMap((c) => c.articles.filter((a) => a.th).map((a) => a.id));
    expect(withTh.sort()).toEqual([...DRAFTED].sort());
    expect(cats.map((c) => c.titleTh)).toEqual(["ตารางงาน", "ผู้ป่วย", "การชำระเงิน", "การตั้งค่า", "บัญชี"]);
    for (const c of cats) for (const a of c.articles) if (a.th) {
      expect(a.th.title.length).toBeGreaterThan(0);
      expect(a.th.body.length).toBeGreaterThan(0);
    }
  });

  it("every bold label in the Thai website notes is a real website string (th.json)", () => {
    const flat = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);
    const labels = new Set(flat(th));
    const missing: string[] = [];
    for (const c of build(true) as Built) for (const a of c.articles) {
      for (const m of (a.th?.web ?? "").matchAll(/\*\*(.+?)\*\*/g)) {
        for (const part of m[1].split(" → ")) if (!labels.has(part)) missing.push(`${a.id}: ${part}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the Thai view: Thai where translated, English otherwise, the same shape", () => {
    const cats: HelpCategory[] = [{
      slug: "agenda", title: { pt: "Agenda", en: "Schedule" }, titleTh: "ตารางงาน",
      articles: [
        { id: "A1", category: "agenda", title: { pt: "pt", en: "en" }, body: { pt: [], en: [{ type: "p", text: "en" }] }, web: { pt: "wpt", en: "wen" }, webUnavailable: false, open: null, appOnly: null, appTitle: null, th: { title: "ไทย", body: [{ type: "p", text: "ไทย" }], web: "เว็บ" } },
        { id: "A2", category: "agenda", title: { pt: "pt2", en: "en2" }, body: { pt: [], en: [{ type: "p", text: "en2" }] }, web: null, webUnavailable: false, open: null, appOnly: null, appTitle: null },
      ],
    }];
    const [c] = thaiOverlay(cats);
    expect(c.title.en).toBe("ตารางงาน");
    expect(c.articles[0].title.en).toBe("ไทย");
    expect(c.articles[0].body.en).toEqual([{ type: "p", text: "ไทย" }]);
    expect(c.articles[0].web?.en).toBe("เว็บ");
    expect(c.articles[1].title.en).toBe("en2");
    expect(helpData("en").cats).toBe(HELP);
  });
});
