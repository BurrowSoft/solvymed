import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clientIp, defaultFoundersCountry, founderPayload, mapApplyError, systemName } from "@/lib/founders";

// The Founders Program page (founders-page-spec.md, stage 1; migration 129).

const flags = vi.hoisted(() => ({ founders: true, foundersRules: false }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: new Proxy(real.liveFeatures, { get: (t, k) => (k === "founders" ? flags.founders : k === "foundersRules" ? flags.foundersRules : (t as Record<string, unknown>)[k as string]) }) };
});
const h = vi.hoisted(() => ({ rpc: [] as { fn: string; args: Record<string, unknown> }[], result: { data: { ok: true, id: "app-1", status: "new" } as unknown, error: null as unknown }, emails: [] as unknown[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { h.rpc.push({ fn, args }); return h.result; } }),
}));
vi.mock("@/lib/foundersEmail", () => ({ sendFounderEmails: async (a: unknown) => { h.emails.push(a); } }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { POST } from "@/app/api/founders/apply/route";
import { NextRequest } from "next/server";

const form = {
  locale: "pt-BR", country: "br", full_name: " Ana Souza ", email: "Ana@Example.com ", phone: "+55 11 99999-0000",
  system: "feegow", usage_years: "1_3", wants: ["patients", "prescriptions"], consent: true,
};
const post = (body: unknown, headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, cookie?: string) =>
  POST(new NextRequest("https://www.solvymed.com/api/founders/apply", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers, ...(cookie ? { cookie } : {}) },
  }));

beforeEach(() => {
  flags.founders = true; flags.foundersRules = false;
  h.rpc = []; h.emails = [];
  h.result = { data: { ok: true, id: "app-1", status: "new" }, error: null };
});

describe("founders helpers", () => {
  it("the form's default country: the language first; in English, the visitor's geo when BR/TH (cf)", () => {
    expect(["pt-BR", "th"].map((l) => defaultFoundersCountry(l, "US"))).toEqual(["BR", "TH"]);
    expect([" br", "TH", "US", null, undefined].map((g) => defaultFoundersCountry("en", g))).toEqual(["BR", "TH", "", "", ""]);
  });
  it("shapes the payload: trimmed, known keys, email lower-cased, country upper-cased, utm only from attribution", () => {
    const p = founderPayload({ ...form, evil: "x", wants: ["a", 3, "", "b"] }, null);
    expect(p).toMatchObject({ full_name: "Ana Souza", email: "ana@example.com", country: "BR", wants: ["a", "b"], consent: true, utm: {} });
    expect(p).not.toHaveProperty("evil");
    const withUtm = founderPayload(form, { first_seen_at: "2026-09-01T00:00:00.000Z", utm_source: "ig", referrer_host: "instagram.com", landing_path: "/pt-BR/founders" });
    // G3: the landing page and first visit too (183 keeps them, as signups do).
    expect(withUtm.utm).toEqual({ utm_source: "ig", referrer: "instagram.com", landing_path: "/pt-BR/founders", first_seen_at: "2026-09-01T00:00:00.000Z" });
  });

  it("the visitor's IP: the first forwarded address, else x-real-ip, else none", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "not an ip" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });

  it("maps 129's errors", () => {
    expect(mapApplyError("invalid:email")).toEqual({ code: "invalid", field: "email" });
    expect(mapApplyError("too_many_attempts")).toEqual({ code: "too_many_attempts" });
    expect(mapApplyError("already_applied")).toEqual({ code: "already_applied" });
    expect(mapApplyError("boom")).toEqual({ code: "generic" });
    expect(systemName("prontuario_verde")).toBe("Prontuário Verde");
  });
});

describe("POST /api/founders/apply", () => {
  it("off until the flag", async () => {
    flags.founders = false;
    expect((await post(form)).status).toBe(404);
    expect(h.rpc).toEqual([]);
  });

  it("a bot (the hidden field filled) gets a fake success and nothing is stored", async () => {
    const res = await post({ ...form, website: "http://spam" });
    expect(await res.json()).toEqual({ status: "new" });
    expect(h.rpc).toEqual([]);
  });

  it("no visitor IP: refused before the database", async () => {
    expect((await post(form, {})).status).toBe(400);
    expect(h.rpc).toEqual([]);
  });

  it("Brazil and Thailand only (e7; the form's line is enforced here)", async () => {
    for (const country of ["OTHER", "US", ""]) {
      const res = await post({ ...form, country });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ code: "invalid", field: "country" });
    }
    expect(h.rpc).toEqual([]);
    expect((await post({ ...form, country: "th" })).status).toBe(200);
  });

  it("applies with the IP, answers with the status only (never the id), and sends the emails", async () => {
    const res = await post(form);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "new" });
    expect(h.rpc[0]).toMatchObject({ fn: "founder_apply", args: { p_client_ip: "203.0.113.7" } });
    expect(h.emails[0]).toMatchObject({ locale: "pt-BR", email: "ana@example.com", system: "feegow", status: "new", id: "app-1" });
  });

  it("waitlist, and a one-row table result, both work", async () => {
    h.result = { data: [{ ok: true, id: "app-2", status: "waitlist" }], error: null };
    expect(await (await post(form)).json()).toEqual({ status: "waitlist" });
  });

  it("the utm comes only from the consent-gated attribution cookie", async () => {
    const attr = encodeURIComponent(JSON.stringify({ first_seen_at: "2026-09-01T00:00:00Z", utm_campaign: "founders" }));
    const consent = (marketing: 0 | 1) => `sm_consent=1.0${marketing}.${Math.floor(Date.now() / 1000)}`;
    await post(form, undefined, `sm_attr=${attr}; ${consent(1)}`);
    expect((h.rpc[0].args.p_payload as { utm: unknown }).utm).toEqual({ utm_campaign: "founders", first_seen_at: "2026-09-01T00:00:00Z" });
    h.rpc = [];
    await post({ ...form, utm: { utm_source: "forged" } });
    expect((h.rpc[0].args.p_payload as { utm: unknown }).utm).toEqual({});
    // As at signup: no marketing consent (withdrawn, never given, or expired) → no campaign.
    for (const cookie of [`sm_attr=${attr}; ${consent(0)}`, `sm_attr=${attr}`, `sm_attr=${attr}; sm_consent=1.01.1`]) {
      h.rpc = [];
      await post(form, undefined, cookie);
      expect((h.rpc[0].args.p_payload as { utm: unknown }).utm).toEqual({});
    }
  });

  it("maps the database's refusals to status codes, and sends no email", async () => {
    h.result = { data: { ok: false, error: "already_applied" }, error: null };
    let res = await post(form);
    expect([res.status, await res.json()]).toEqual([409, { code: "already_applied" }]);
    h.result = { data: { ok: false, error: "too_many_attempts" }, error: null };
    res = await post(form);
    expect(res.status).toBe(429);
    h.result = { data: { ok: false, error: "invalid:phone" }, error: null };
    res = await post(form);
    expect([res.status, await res.json()]).toEqual([400, { code: "invalid", field: "phone" }]);
    h.result = { data: { ok: false, error: "invalid:client_ip" }, error: null };
    res = await post(form);
    expect([res.status, await res.json()]).toEqual([400, { code: "invalid", field: "client_ip" }]);
    // A thrown RPC error is a real failure, never read as a refusal.
    h.result = { data: null, error: { message: "already_applied" } };
    res = await post(form);
    expect([res.status, await res.json()]).toEqual([500, { code: "generic" }]);
    expect(h.emails).toEqual([]);
  });
});
