// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import cases from "./fixtures/patient-channel-score-cases.json";
import type { ChannelConfig } from "@/lib/patientChannel/score";
import { checkAnswers, scoreForRequest, storedAnswers } from "@/lib/patientChannel/requestScore";
import { toStoredRules } from "@/lib/patientChannel/rules";

// Patient Channel M4b: the patient's routes (/preview, /requests, /selfserve) and the ONE
// scoring both the submit and a rules save's rescore use (cf, #620).

const sample = cases.config as ChannelConfig;
const PROF = "11111111-1111-4111-8111-111111111111";
const REASON = "22222222-2222-4222-8222-222222222222";
const FORM = { symptomIds: ["s1", "s2"], chips: [], when: 2, intensity: 0, stillTaking: 0, text: "" };

const h = vi.hoisted(() => ({
  user: { id: "pat1" } as { id: string } | null,
  enabled: true,
  pageError: null as null | { message: string },
  reason: { kind: "symptom_form", options: [] as string[] } as { kind: string; options: string[] } | null,
  submitErrors: [] as { message: string; details?: string }[],
  calls: [] as { fn: string; args: unknown }[],
  rules: null as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/patientChannel/live", () => ({ patientChannelEnabled: async () => h.enabled }));
vi.mock("@/lib/patientChannel/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/server")>()),
  pcCaller: async () => ({
    user: h.user,
    db: { rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.pageError ? { data: null, error: h.pageError } : { data: {}, error: null }; } },
  }),
  pcAdmin: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain, eq: () => chain, is: () => chain,
        maybeSingle: async () => table === "pc_settings"
          ? { data: { rules: h.rules, rules_version: 7, ai_mapping: false }, error: null }
          : table === "professionals" ? { data: { country: "BR" }, error: null }
          : { data: h.reason, error: null },
      };
      return chain;
    },
    rpc: async (fn: string, args: unknown) => {
      h.calls.push({ fn, args });
      if (fn === "pc_submit") {
        const e = h.submitErrors.shift();
        return e ? { data: null, error: e } : { data: { id: "q1", replaced: null }, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

const { POST: preview } = await import("@/app/api/patient-channel/preview/route");
const { POST: submit } = await import("@/app/api/patient-channel/requests/route");
const { POST: selfserve } = await import("@/app/api/patient-channel/selfserve/route");
const post = (fn: (r: NextRequest) => Promise<Response>, body: unknown) =>
  fn(new NextRequest("https://www.solvymed.com/api/x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  h.user = { id: "pat1" };
  h.enabled = true;
  h.pageError = null;
  h.reason = { kind: "symptom_form", options: [] };
  h.submitErrors = [];
  h.calls = [];
  h.rules = toStoredRules(sample);
});

describe("the one scoring (submit = rescore), per reason kind", () => {
  it("an options or exam request always scores 0, green, no warning, whatever the rules", () => {
    for (const kind of ["options", "exam"] as const) {
      const r = scoreForRequest(sample, kind, { ...FORM, symptomIds: ["s7"], text: "dor no peito" });
      expect([r.total, r.band, r.warning, r.floorApplied, r.lines]).toEqual([0, "green", false, false, []]);
    }
    expect(scoreForRequest(sample, "symptom_form", FORM).total).toBe(8);
  });

  it("a stored request rescored after a save gives what the submit gave with the same rules", () => {
    const sent = scoreForRequest(sample, "symptom_form", { ...FORM, text: "muita coceira" });
    const stored = { symptomIds: FORM.symptomIds, chips: [], when: 2, intensity: 0, stillTaking: 0 };
    const again = scoreForRequest(sample, "symptom_form", storedAnswers(stored, "muita coceira"));
    expect(again).toEqual(sent);
  });

  it("answers are checked, not scored as 0 when wrong (cf, #613)", () => {
    const reason = { kind: "symptom_form" as const, options: [] };
    expect(checkAnswers(sample, reason, FORM)).not.toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, when: 3 })).toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, symptomIds: ["nope"] })).toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, symptomIds: ["s1", "s1"] })).toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, text: "x".repeat(501) })).toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, chips: [{ kind: "symptom", ref: "zz", text: "X" }] })).toBeNull();
    const opts = { kind: "options" as const, options: ["Recibo"] };
    expect(checkAnswers(sample, opts, { option: "Recibo" })?.option).toBe("Recibo");
    expect(checkAnswers(sample, opts, { option: "Outra" })).toBeNull();
  });
});

describe("POST /api/patient-channel/preview", () => {
  it("only what the patient may see: the warning, the messages, the skip; never a score", async () => {
    const res = await post(preview, { profId: PROF, reasonId: REASON, answers: { ...FORM, symptomIds: ["s2"], when: 0, intensity: 0 } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ warning: false, autoMessages: [{ id: "a1", text: sample.autoMessages[0].text, tone: "info" }], canSkip: true });
    expect(JSON.stringify(body)).not.toMatch(/total|band|lines/);
    expect(h.calls[0]).toEqual({ fn: "pc_patient_page", args: { p_prof: PROF } });
  });

  it("237's access answers: not connected 403, channel off 404, archived 403 with its code; bad answers 422", async () => {
    h.pageError = { message: "not_connected" };
    expect((await post(preview, { profId: PROF, reasonId: REASON, answers: FORM })).status).toBe(403);
    h.pageError = { message: "channel_off" };
    expect((await post(preview, { profId: PROF, reasonId: REASON, answers: FORM })).status).toBe(404);
    h.pageError = { message: "pc_patient_archived" };
    const archived = await post(preview, { profId: PROF, reasonId: REASON, answers: FORM });
    expect([archived.status, (await archived.json()).code]).toEqual([403, "pc_patient_archived"]);
    h.pageError = null;
    expect((await post(preview, { profId: PROF, reasonId: REASON, answers: { ...FORM, intensity: 9 } })).status).toBe(422);
    expect((await post(preview, { profId: "x", reasonId: REASON, answers: FORM })).status).toBe(400);
    h.user = null;
    expect((await post(preview, { profId: PROF, reasonId: REASON, answers: FORM })).status).toBe(401);
  });
});

describe("POST /api/patient-channel/requests", () => {
  it("scores on the server and writes with pc_submit: the version, the score, only messages that fired", async () => {
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM, autoMessagesShown: ["a1", "fake"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "q1", replaced: null });
    const p = (h.calls.find((c) => c.fn === "pc_submit")!.args as { p: Record<string, unknown> }).p;
    expect(p).toMatchObject({ profId: PROF, patientAuthId: "pat1", reasonId: REASON, rulesVersion: 7, replace: false, autoMessagesShown: [] });
    expect(p.score).toMatchObject({ total: 8, band: "amber", warningShown: false, floorApplied: false });
    expect(p.answers).toEqual({ symptomIds: ["s1", "s2"], chips: [], when: 2, intensity: 0, stillTaking: 0 });
  });

  it("an options request stores the option and scores 0", async () => {
    h.reason = { kind: "options", options: ["Recibo"] };
    await post(submit, { profId: PROF, reasonId: REASON, answers: { option: "Recibo" } });
    const p = (h.calls.find((c) => c.fn === "pc_submit")!.args as { p: Record<string, unknown> }).p;
    expect(p.answers).toEqual({ option: "Recibo" });
    expect(p.score).toMatchObject({ total: 0, band: "green" });
  });

  it("one open at a time: 409 open_exists; with replace the RPC replaces", async () => {
    h.submitErrors = [{ message: "open_exists" }];
    expect((await post(submit, { profId: PROF, reasonId: REASON, answers: FORM })).status).toBe(409);
    await post(submit, { profId: PROF, reasonId: REASON, answers: FORM, replace: true });
    expect((h.calls.filter((c) => c.fn === "pc_submit").at(-1)!.args as { p: { replace: boolean } }).p.replace).toBe(true);
  });

  it("rules_changed: rescored and retried once, then 503 retry_later", async () => {
    h.submitErrors = [{ message: "rules_changed" }];
    expect((await post(submit, { profId: PROF, reasonId: REASON, answers: FORM })).status).toBe(200);
    expect(h.calls.filter((c) => c.fn === "pc_submit")).toHaveLength(2);
    h.calls = [];
    h.submitErrors = [{ message: "rules_changed" }, { message: "rules_changed" }];
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM });
    expect([res.status, (await res.json()).code]).toEqual([503, "retry_later"]);
  });

  it("too many sends in an hour (the database's limit, cf #623) → 429 rate_limited", async () => {
    h.submitErrors = [{ message: "rate_limited" }];
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM, replace: true });
    expect([res.status, (await res.json()).code]).toEqual([429, "rate_limited"]);
  });

  it("the practice closed meanwhile → 403 pc_practice_closed (the page shows 'not available')", async () => {
    h.submitErrors = [{ message: "pc_practice_closed" }];
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM });
    expect([res.status, (await res.json()).code]).toEqual([403, "pc_practice_closed"]);
  });
});

describe("POST /api/patient-channel/selfserve", () => {
  it("counts a kind (no content); anything else is refused", async () => {
    expect((await post(selfserve, { profId: PROF, kind: "faq_resolved" })).status).toBe(204);
    expect(h.calls.at(-1)).toEqual({ fn: "pc_count_selfserve", args: { p_prof: PROF, p_kind: "faq_resolved" } });
    expect((await post(selfserve, { profId: PROF, kind: "x" })).status).toBe(400);
  });
});

describe("launch polish 2 / 15 (255: one open request per destination; answers -1)", () => {
  it("open_exists: 409 with only the open request's title and date (from DETAIL), never logged", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    h.submitErrors = [{ message: "open_exists", details: JSON.stringify({ id: "q-open", reasonTitle: "Possível efeito colateral", createdAt: "2026-10-26T13:05:00Z", destination: "doctor" }) }];
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "open_exists", open: { reasonTitle: "Possível efeito colateral", createdAt: "2026-10-26T13:05:00Z" } });
    for (const s of spies) {
      for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain("Possível efeito colateral");
      s.mockRestore();
    }
  });

  it("open_exists without a usable DETAIL: 409 with open null", async () => {
    for (const details of [undefined, "", "not json", JSON.stringify({ id: "x" })]) {
      h.submitErrors = [{ message: "open_exists", details }];
      const res = await post(submit, { profId: PROF, reasonId: REASON, answers: FORM });
      expect([res.status, await res.json()]).toEqual([409, { code: "open_exists", open: null }]);
    }
  });

  it("unanswered questions (-1) are accepted and sent as -1; below -1 or above the range is refused", async () => {
    const reason = { kind: "symptom_form" as const, options: [] };
    expect(checkAnswers(sample, reason, { ...FORM, when: -1, intensity: -1, stillTaking: -1 })).not.toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, when: -2 })).toBeNull();
    expect(checkAnswers(sample, reason, { ...FORM, stillTaking: 2 })).toBeNull();
    const res = await post(submit, { profId: PROF, reasonId: REASON, answers: { ...FORM, when: -1, intensity: -1, stillTaking: -1 } });
    expect(res.status).toBe(200);
    const p = (h.calls.find((c) => c.fn === "pc_submit")!.args as { p: { answers: Record<string, unknown> } }).p;
    expect(p.answers).toMatchObject({ when: -1, intensity: -1, stillTaking: -1 });
  });
});
