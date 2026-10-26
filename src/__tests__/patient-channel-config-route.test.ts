// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import cases from "./fixtures/patient-channel-score-cases.json";
import type { ChannelConfig } from "@/lib/patientChannel/score";
import { toStoredRules } from "@/lib/patientChannel/rules";

// PUT /api/patient-channel/config (M3b-1): the doctor's save. Validated as 237's
// _pc_rules_valid, saved with the version (409 on a newer save), then the OPEN requests
// scored with an older version are rescored with score.ts.

const h = vi.hoisted(() => ({
  user: { id: "doc1" } as { id: string } | null,
  enabled: true,
  doctor: true as boolean | null,
  saveError: null as null | { message: string },
  open: [] as { id: string; answers: unknown; text: string | null }[],
  calls: [] as { fn: string; args: unknown }[],
  captured: [] as string[],
}));
vi.mock("@/lib/patientChannel/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/server")>()),
  pcCaller: async () => ({ user: h.user, db: {} }),
  pcAdmin: () => ({
    rpc: async (fn: string, args: unknown) => {
      h.calls.push({ fn, args });
      if (fn === "pc_save_rules") return h.saveError ? { data: null, error: h.saveError } : { data: 4, error: null };
      return { data: (args as { p_scores: unknown[] }).p_scores.length, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ lt: async () => ({ data: h.open, error: null }) }) }) }) }),
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/patientChannel/live", () => ({ patientChannelEnabled: async () => h.enabled }));
vi.mock("@/lib/effectiveProfId", () => ({ isProfessionalRole: async () => h.doctor }));
vi.mock("@/lib/practiceCountry", () => ({ getPracticeCountry: async () => "BR" }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: (m: string) => h.captured.push(m) }));

const { PUT } = await import("@/app/api/patient-channel/config/route");
const sample = cases.config as ChannelConfig;
const put = (body: unknown, raw?: string) =>
  PUT(new NextRequest("https://www.solvymed.com/api/patient-channel/config", { method: "PUT", body: raw ?? JSON.stringify(body) }));

beforeEach(() => {
  h.user = { id: "doc1" };
  h.enabled = true;
  h.doctor = true;
  h.saveError = null;
  h.open = [];
  h.calls = [];
  h.captured = [];
});

describe("PUT /api/patient-channel/config", () => {
  it("refuses: signed out 401, channel off 404, not a doctor 403, too large 413, junk 400", async () => {
    h.user = null;
    expect((await put({})).status).toBe(401);
    h.user = { id: "doc1" };
    h.enabled = false;
    expect((await put({})).status).toBe(404);
    h.enabled = true;
    h.doctor = false;
    expect((await put({})).status).toBe(403);
    h.doctor = true;
    expect((await put(null, "x".repeat(200 * 1024))).status).toBe(413);
    expect((await put({ rules: toStoredRules(sample) })).status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("invalid rules → 422 with the first field path; nothing saved", async () => {
    const bad = { ...toStoredRules(sample), medicines: ["X"] };
    const res = await put({ rules: bad, expectedVersion: 3 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "invalid_rules", path: "medicines.0" });
    expect(h.calls).toEqual([]);
  });

  it("saves only the six engine keys with the version read", async () => {
    const res = await put({ rules: { ...toStoredRules(sample), aiMapping: true, country: "TH" }, expectedVersion: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 4, rescored: 0 });
    const save = h.calls[0];
    expect(save.fn).toBe("pc_save_rules");
    expect(save.args).toMatchObject({ p_prof: "doc1", p_expected_version: 3 });
    expect(Object.keys((save.args as { p_rules: object }).p_rules).sort()).toEqual(["autoMessages", "combinations", "medicines", "minBandForTextOnly", "symptoms", "thresholds"]);
  });

  it("a newer save elsewhere → 409 version_conflict", async () => {
    h.saveError = { message: "version_conflict" };
    const res = await put({ rules: toStoredRules(sample), expectedVersion: 2 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "version_conflict" });
  });

  it("rescores the open requests with the saved rules (score.ts)", async () => {
    h.open = [{ id: "q1", answers: { symptomIds: ["s1", "s2"], chips: [], when: 2, intensity: 0, stillTaking: 0 }, text: null }];
    const res = await put({ rules: toStoredRules(sample), expectedVersion: 3 });
    expect(await res.json()).toEqual({ version: 4, rescored: 1 });
    const rescore = h.calls.find((c) => c.fn === "pc_rescore_open")!;
    expect(rescore.args).toMatchObject({ p_prof: "doc1", p_version: 4, p_scores: [{ id: "q1", total: 8, band: "amber", floorApplied: false }] });
  });
});
