import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// G7 (cf; migration 187): the first-touch campaign also goes with the signup
// (marketing consent only), and confirmation claims it, so a link opened in
// another browser still records it.

const h = vi.hoisted(() => ({ rpc: vi.fn(async (_fn: string, _args?: unknown) => ({ data: null, error: null })) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", user_metadata: {} } } }) }, rpc: h.rpc }),
}));
vi.mock("@/lib/authRouting", () => ({ routeAfterAuth: async () => "/pt-BR/dashboard" }));

import { signupAttributionMetadata } from "@/lib/signupAttribution";
import { POST } from "@/app/api/auth/after-verify/route";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent";
import { ATTRIBUTION_COOKIE, serializeAttribution } from "@/lib/attribution";

const clearCookies = () => { for (const n of [CONSENT_COOKIE, ATTRIBUTION_COOKIE]) document.cookie = `${n}=; Max-Age=0; Path=/`; };
afterEach(() => { clearCookies(); h.rpc.mockClear(); });

describe("the signup's metadata", () => {
  const attr = { first_seen_at: "2026-10-01T10:00:00.000Z", utm_source: "agencia", utm_campaign: "founders-2026", landing_path: "/pt-BR/founders" };

  it("with marketing consent and a first touch: the cookie's fields", () => {
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent({ analytics: false, marketing: true })}; Path=/`;
    document.cookie = `${ATTRIBUTION_COOKIE}=${serializeAttribution(attr)}; Path=/`;
    expect(signupAttributionMetadata()).toEqual({ signup_attr: attr });
  });

  it("nothing without marketing consent, or without a first touch (or the 'sent' marker)", () => {
    document.cookie = `${ATTRIBUTION_COOKIE}=${serializeAttribution(attr)}; Path=/`;
    expect(signupAttributionMetadata()).toEqual({});
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent({ analytics: true, marketing: false })}; Path=/`;
    expect(signupAttributionMetadata()).toEqual({});
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent({ analytics: false, marketing: true })}; Path=/`;
    document.cookie = `${ATTRIBUTION_COOKIE}=sent; Path=/`;
    expect(signupAttributionMetadata()).toEqual({});
  });
});

describe("after-verify claims the pending attribution", () => {
  const post = (type: string, cookie = "") =>
    POST(new NextRequest("https://www.solvymed.com/api/auth/after-verify", {
      method: "POST", body: JSON.stringify({ locale: "pt-BR", type }), headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    }));

  it("a signup confirmation in another browser (no cookie): the claim alone", async () => {
    await post("signup");
    expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["claim_signup_attribution"]);
  });

  it("the same browser: the cookie's row first, then the claim (which keeps it and clears the pending row)", async () => {
    const consent = `${CONSENT_COOKIE}=${serializeConsent({ analytics: false, marketing: true })}`;
    const cookie = `${consent}; ${ATTRIBUTION_COOKIE}=${serializeAttribution({ first_seen_at: new Date().toISOString(), utm_source: "x" })}`;
    await post("email", cookie);
    expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["record_signup_attribution", "claim_signup_attribution"]);
  });

  it("not for other links (a password recovery)", async () => {
    await post("recovery");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
