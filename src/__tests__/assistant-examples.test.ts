import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// docs/assistant-examples.ndjson: one example of every line the SolvyAI
// route streams (docs/assistant-api.md). The app copies the same file into
// its own fixture test, so a shape change breaks both sides together. This
// checks every line against the contract.

const lines = readFileSync(join(__dirname, "..", "..", "docs", "assistant-examples.ndjson"), "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Record<string, unknown>);

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// The contract's href rule: one leading "/", no backslash, control
// characters or scheme.
const internalHref = (h: unknown) =>
  isStr(h) && h.startsWith("/") && !h.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(h) && !/^[a-z][a-z0-9+.-]*:/i.test(h);

const WARNING_CODES = ["blocked", "outside_hours", "same_patient_day", "pending_request_overlap"];
const ACTION_KINDS = [
  "book_appointment", "move_appointment", "cancel_appointment", "block_time", "unblock_time",
  "booking_decision", "add_patient", "mark_paid", "send_pix",
];
const SCREENS = ["home", "schedule", "patients", "patient", "payments", "settings", "whatsapp", "help"];
const ERROR_CODES = ["model_failed"];
const STOP_CODES = ["past_time", "patient_archived", "not_allowed"];

// The screen-name form of a link, for the app (web uses the href).
function checkTarget(t: unknown) {
  expect(isObj(t)).toBe(true);
  const x = t as Record<string, unknown>;
  expect(SCREENS).toContain(x.screen);
  if ("date" in x) expect(x.date).toMatch(DATE);
  if ("params" in x) expect(Object.values(x.params as object).every((v) => typeof v === "string")).toBe(true);
}

function checkCard(card: unknown) {
  expect(isObj(card)).toBe(true);
  const c = card as Record<string, unknown>;
  for (const k of ["id", "icon", "title", "expiresAt"]) expect(isStr(c[k]), k).toBe(true);
  expect(Number.isNaN(Date.parse(c.expiresAt as string))).toBe(false);
  expect(Array.isArray(c.fields) && (c.fields as unknown[]).length > 0).toBe(true);
  for (const f of c.fields as Record<string, unknown>[]) {
    expect(isStr(f.label) && isStr(f.value)).toBe(true);
    if ("isDefault" in f) expect(typeof f.isDefault).toBe("boolean");
  }
  expect(Array.isArray(c.warnings)).toBe(true);
  for (const w of c.warnings as Record<string, unknown>[]) {
    expect(WARNING_CODES).toContain(w.code);
    expect(isStr(w.text)).toBe(true);
  }
  const codes = (c.warnings as { code: string }[]).map((w) => w.code);
  // Blocked / outside hours always ask twice; the others never do.
  if (codes.includes("blocked") || codes.includes("outside_hours")) {
    expect(isObj(c.secondConfirm)).toBe(true);
    const s = c.secondConfirm as Record<string, unknown>;
    expect(isStr(s.question) && isStr(s.confirmLabel)).toBe(true);
  } else {
    expect(c.secondConfirm).toBeUndefined();
  }
  expect(typeof c.hardStop).toBe("boolean");
  if (c.hardStop) {
    const stop = c.stop as Record<string, unknown>;
    expect(STOP_CODES).toContain(stop.code);
    expect(isStr(stop.text)).toBe(true);
  } else {
    expect(c.stop).toBeUndefined();
  }
  checkTarget(c.editTarget);
  checkTarget(c.viewTarget);
  expect(internalHref(c.editHref), String(c.editHref)).toBe(true);
  expect(internalHref(c.viewHref), String(c.viewHref)).toBe(true);
  const after = c.after as Record<string, unknown>;
  expect(SCREENS).toContain(after.screen);
  if ("date" in after) expect(after.date).toMatch(DATE);
  const action = c.action as Record<string, unknown>;
  expect(ACTION_KINDS).toContain(action.kind);
  expect(isObj(action.args)).toBe(true);
}

function checkBlock(block: unknown) {
  expect(isObj(block)).toBe(true);
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case "text": expect(isStr(b.text)).toBe(true); break;
    case "steps": expect((b.items as unknown[]).every(isStr)).toBe(true); break;
    case "open": expect(isStr(b.label) && internalHref(b.href)).toBe(true); checkTarget(b.target); break;
    case "pick":
      expect(isStr(b.question)).toBe(true);
      for (const o of b.options as Record<string, unknown>[]) expect(isStr(o.id) && isStr(o.title) && typeof o.detail === "string").toBe(true);
      break;
    case "card": checkCard(b.card); break;
    case "slot_choice":
      expect(["conflict", "recurring_conflict", "confirm_failed"]).toContain(b.reason);
      expect(isStr(b.text)).toBe(true);
      for (const x of b.conflicts as Record<string, unknown>[]) {
        expect(x.date).toMatch(DATE); expect(x.start).toMatch(TIME); expect(x.end).toMatch(TIME); expect(isStr(x.what)).toBe(true);
      }
      for (const a of b.alternatives as Record<string, unknown>[]) { expect(a.date).toMatch(DATE); expect(a.start).toMatch(TIME); }
      expect(typeof b.other).toBe("boolean");
      break;
    case "feedback": expect(Object.keys(b)).toEqual(["type"]); break;
    default: throw new Error(`unknown block type ${String(b.type)}`);
  }
}

describe("SolvyAI stream examples (docs/assistant-examples.ndjson)", () => {
  it.each(lines.map((l, i) => [i + 1, l] as const))("line %i matches the contract", (_n, line) => {
    switch (line.kind) {
      case "meta": expect(["help", "actions"]).toContain(line.mode); break;
      case "delta": expect(isStr(line.text)).toBe(true); break;
      case "block": checkBlock(line.block); break;
      case "usage":
        for (const k of ["used", "limit", "extra"]) expect(Number.isInteger(line[k]), k).toBe(true);
        expect(Number.isNaN(Date.parse(line.resetsAt as string))).toBe(false);
        break;
      case "done": expect(Object.keys(line)).toEqual(["kind"]); break;
      case "error": expect(ERROR_CODES).toContain(line.code); break;
      default: throw new Error(`unknown kind ${String(line.kind)}`);
    }
  });

  it("covers every line kind, block type, warning code and slot_choice reason", () => {
    const kinds = new Set(lines.map((l) => l.kind));
    for (const k of ["meta", "delta", "block", "usage", "done", "error"]) expect(kinds).toContain(k);
    const blocks = lines.filter((l) => l.kind === "block").map((l) => l.block as Record<string, unknown>);
    for (const t of ["text", "steps", "open", "pick", "card", "slot_choice", "feedback"]) expect(blocks.map((b) => b.type)).toContain(t);
    const warn = blocks.filter((b) => b.type === "card").flatMap((b) => ((b.card as { warnings: { code: string }[] }).warnings).map((w) => w.code));
    for (const w of WARNING_CODES) expect(warn).toContain(w);
    expect(blocks.some((b) => b.type === "card" && (b.card as { hardStop: boolean }).hardStop)).toBe(true);
    const reasons = blocks.filter((b) => b.type === "slot_choice").map((b) => b.reason);
    for (const r of ["conflict", "recurring_conflict", "confirm_failed"]) expect(reasons).toContain(r);
  });

  it("the href rule refuses external and tricky links", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/a\u0000b", ""]) expect(internalHref(bad), bad).toBe(false);
    expect(internalHref("/dashboard/schedule?date=2026-09-29")).toBe(true);
  });
});
