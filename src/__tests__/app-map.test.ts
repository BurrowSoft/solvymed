import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ACTIONS, GENERAL, GLOSSARY, NEVER, appMapText, isMet, ruleIsLive, type ConditionId } from "@/lib/solvyai/app-map";
import conditions from "../../content/help/conditions.json";
import help from "@/content/helpArticles.json";

// The drift test (specs/assistant.md §4): the App Map, the contract's
// proposal tools and the code must name the same things. A new action,
// tool or rename that forgets one side fails here.

const ROOT = join(__dirname, "..", "..");
const CONTRACT = readFileSync(join(ROOT, "docs", "assistant-api.md"), "utf8");
const EXAMPLES = readFileSync(join(ROOT, "docs", "assistant-examples.ndjson"), "utf8");

// The proposal tools the contract lists (docs/assistant-api.md §5).
const contractTools = [...new Set([...CONTRACT.matchAll(/`(propose_[a-z_]+)`/g)].map((m) => m[1]))];

// Every RPC the website calls.
function webRpcs(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/rpc\("([a-z_]+)"/g)) out.add(m[1]);
    }
  };
  walk(join(ROOT, "src"));
  return out;
}

const helpIds = new Set((help as { articles: { id: string }[] }[]).flatMap((c) => c.articles.map((a) => a.id)));

describe("App Map ↔ the contract ↔ the code", () => {
  it("every proposal tool in the contract has exactly one App Map action, and vice versa", () => {
    expect(contractTools.length).toBeGreaterThan(0);
    expect(ACTIONS.map((a) => a.tool).sort()).toEqual([...contractTools].sort());
    expect(new Set(ACTIONS.map((a) => a.kind)).size).toBe(ACTIONS.length);
  });

  it("each tool matches its action kind (propose_<kind> or the contract's name)", () => {
    for (const a of ACTIONS) expect(CONTRACT, a.tool).toContain(a.tool);
    // The action kinds the stream examples use are all in the map.
    const kinds = new Set([...EXAMPLES.matchAll(/"kind":"([a-z_]+)","args"/g)].map((m) => m[1]));
    for (const k of kinds) expect(ACTIONS.map((a) => a.kind), k).toContain(k);
  });

  it("the web code each action names really exists (an exported server action)", () => {
    for (const a of ACTIONS) {
      if (!a.runs.web) continue;
      const src = readFileSync(join(ROOT, a.runs.web.module), "utf8");
      expect(src, `${a.kind}: ${a.runs.web.fn}`).toMatch(new RegExp(`export async function ${a.runs.web.fn}\\b`));
    }
  });

  it("every RPC an action names is one the website really calls", () => {
    const rpcs = webRpcs();
    for (const a of ACTIONS) for (const r of a.runs.rpcs) expect(rpcs.has(r), `${a.kind}: ${r}`).toBe(true);
  });

  it("every Help article it points to exists", () => {
    for (const a of ACTIONS) expect(helpIds.has(a.help), `${a.kind}: ${a.help}`).toBe(true);
    for (const n of NEVER) expect(helpIds.has(n.help), n.what).toBe(true);
    // GENERAL rules may point to an article held by a condition: it must exist in the sources.
    const sourceIds = new Set(readdirSync(join(ROOT, "content", "help")).filter((f) => f.endsWith(".md"))
      .flatMap((f) => [...readFileSync(join(ROOT, "content", "help", f), "utf8").matchAll(/^## (\w+)\./gm)].map((m) => m[1])));
    for (const g of GENERAL) expect(sourceIds.has(g.help), g.help).toBe(true);
  });

  it("every action has rules, a card and inputs; the text form is complete", () => {
    for (const a of ACTIONS) {
      expect(a.rules.length, a.kind).toBeGreaterThan(0);
      expect(a.card.length, a.kind).toBeGreaterThan(0);
      expect(a.inputs.required.length, a.kind).toBeGreaterThan(0);
    }
    const text = appMapText();
    for (const a of ACTIONS) expect(text).toContain(a.tool);
    expect(text).toContain("## Never via SolvyAI");
    expect(GLOSSARY.length).toBeGreaterThan(5);
  });

  it("a pending rule names registered conditions, and is in the model's text only once they're met", () => {
    const text = appMapText();
    const pending = [...ACTIONS.flatMap((a) => a.rules), ...GENERAL.map((g) => g.rule)].filter((r) => typeof r !== "string");
    expect(pending.length).toBeGreaterThan(0);
    for (const r of pending) {
      expect(r.pending.length, r.text).toBeGreaterThan(0);
      for (const id of r.pending) expect(Object.keys(conditions), `${r.text}: ${id}`).toContain(id);
      if (r.pending.every(isMet)) expect(text, r.text).toContain(r.text);
      else expect(text, r.text).not.toContain(r.text);
    }
  });

  it("a condition flipping to met makes its rules live (one registry for Help and the App Map)", () => {
    const r = { text: "x", pending: ["mobile#91"] as ConditionId[] };
    expect(ruleIsLive(r)).toBe(isMet("mobile#91"));
    expect(ruleIsLive("always")).toBe(true);
  });

  it("the 'never' list covers the spec's (clinical data, deletions, settings, account)", () => {
    const all = NEVER.map((n) => n.what.toLowerCase()).join(" | ");
    for (const w of ["record", "prescription", "archiv", "closing the account", "pix", "subscription", "secretary", "country"]) expect(all, w).toContain(w);
  });
});
