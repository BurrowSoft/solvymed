import { describe, expect, it, vi } from "vitest";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  CONSENT_VERSION,
  isTransactionalPath,
  parseConsent,
  serializeConsent,
} from "@/lib/consent";
import {
  ATTRIBUTION_COOKIE,
  attributionPayload,
  captureAttribution,
  parseAttribution,
  redactLandingPath,
  serializeAttribution,
} from "@/lib/attribution";
import { recordSignupAttribution } from "@/lib/recordAttribution";

const LOCALES = ["en", "pt-BR", "zh-TW"] as const;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

describe("consent cookie", () => {
  it("round-trips each combination", () => {
    for (const analytics of [false, true]) {
      for (const marketing of [false, true]) {
        expect(parseConsent(serializeConsent({ analytics, marketing }, NOW), NOW)).toEqual({ analytics, marketing });
      }
    }
  });

  it("is unanswered when missing or malformed", () => {
    for (const raw of [null, undefined, "", "1.1.123", "1.12.123", "x.11.123", `${CONSENT_VERSION}.11.abc`, "1.11.1;x=1"]) {
      expect(parseConsent(raw, NOW)).toBeNull();
    }
  });

  it("asks again after 12 months", () => {
    const saved = serializeConsent({ analytics: true, marketing: true }, NOW);
    expect(parseConsent(saved, NOW + (CONSENT_MAX_AGE_S - 60) * 1000)).not.toBeNull();
    expect(parseConsent(saved, NOW + (CONSENT_MAX_AGE_S + 60) * 1000)).toBeNull();
  });

  it("asks again when the consent version changes", () => {
    const [, flags, t] = serializeConsent({ analytics: true, marketing: false }, NOW).split(".");
    expect(parseConsent(`${CONSENT_VERSION + 1}.${flags}.${t}`, NOW)).toBeNull();
  });

  it("rejects a timestamp from the future", () => {
    expect(parseConsent(serializeConsent({ analytics: true, marketing: true }, NOW + 2 * 86400e3), NOW)).toBeNull();
  });
});

describe("isTransactionalPath", () => {
  it.each([
    "/auth/confirm", "/auth/verify", "/auth/reset-password",
    "/pt-BR/auth/confirm", "/zh-TW/auth/verify", "/pt-BR/auth/reset-password", "/api/auth/callback",
  ])("no banner on %s", (p) => expect(isTransactionalPath(p, LOCALES)).toBe(true));

  it.each([
    "/", "/pt-BR", "/pt-BR/", "/auth/login", "/auth/signup", "/pt-BR/auth/forgot-password",
    "/dashboard", "/pt-BR/dashboard/settings", "/privacy", "/auth/confirmed", "/auth/verify-later",
  ])("banner on %s", (p) => expect(isTransactionalPath(p, LOCALES)).toBe(false));
});

describe("captureAttribution", () => {
  const base = { ownHost: "www.solvymed.com", nowMs: NOW };

  it("keeps UTM values, the external referrer host and the bare path", () => {
    const a = captureAttribution({
      ...base,
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_term=agenda+medica&utm_content=a&gclid=SECRET&email=x@y.com",
      referrer: "https://www.google.com.br/search?q=private+stuff",
      pathname: "/pt-BR",
    });
    expect(a).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "launch",
      utm_term: "agenda medica",
      utm_content: "a",
      referrer_host: "www.google.com.br",
      landing_path: "/pt-BR",
      first_seen_at: "2026-09-27T12:00:00.000Z",
    });
  });

  it("drops our own site (www or apex) and a missing referrer", () => {
    for (const referrer of ["https://solvymed.com/", "https://www.solvymed.com/pt-BR", "", "not a url"]) {
      expect(captureAttribution({ ...base, search: "", referrer, pathname: "/" }).referrer_host).toBeUndefined();
    }
  });

  it("clips long values to 200 characters", () => {
    const a = captureAttribution({ ...base, search: `?utm_campaign=${"x".repeat(500)}`, referrer: "", pathname: "/" });
    expect(a.utm_campaign).toHaveLength(200);
  });

  it("redacts invite and join codes from the landing path", () => {
    expect(redactLandingPath("/invite/ABC123")).toBe("/invite/:code");
    expect(redactLandingPath("/pt-BR/invite/ABC123")).toBe("/pt-BR/invite/:code");
    expect(redactLandingPath("/join/XYZ")).toBe("/join/:code");
    expect(redactLandingPath("/pt-BR/join/secretary/SEC-1")).toBe("/pt-BR/join/secretary/:code");
    expect(redactLandingPath("/pt-BR/book/123")).toBe("/pt-BR/book/123");
  });
});

describe("attribution cookie", () => {
  it("round-trips", () => {
    const a = captureAttribution({ search: "?utm_source=ig", referrer: "https://l.instagram.com/", pathname: "/", ownHost: "www.solvymed.com", nowMs: NOW });
    expect(parseAttribution(serializeAttribution(a))).toEqual(a);
  });

  it("drops unknown keys and non-string values, and re-redacts the path", () => {
    const raw = encodeURIComponent(JSON.stringify({
      first_seen_at: "2026-09-27T12:00:00.000Z",
      utm_source: 5,
      utm_medium: "email",
      landing_path: "/invite/SECRET?token=abc",
      platform: "mobile",
      user_id: "someone-else",
    }));
    expect(parseAttribution(raw)).toEqual({
      first_seen_at: "2026-09-27T12:00:00.000Z",
      utm_medium: "email",
      landing_path: "/invite/:code",
    });
  });

  it("is unusable without a valid first_seen_at, or when malformed", () => {
    for (const raw of [null, "", "%E0%A4%A", "not json", encodeURIComponent("[]"), encodeURIComponent(JSON.stringify({ utm_source: "x" })), encodeURIComponent(JSON.stringify({ first_seen_at: "nope" }))]) {
      expect(parseAttribution(raw)).toBeNull();
    }
  });

  it("builds the RPC payload with platform web", () => {
    expect(attributionPayload({ first_seen_at: "t", utm_source: "g" })).toEqual({ first_seen_at: "t", utm_source: "g", platform: "web" });
  });
});

describe("recordSignupAttribution", () => {
  const attr = serializeAttribution({ first_seen_at: "2026-09-27T12:00:00.000Z", utm_source: "google", landing_path: "/pt-BR" });
  const jar = (values: Record<string, string>) => ({
    get: (name: string) => (name in values ? { value: values[name] } : undefined),
  });
  const consent = (marketing: boolean) => serializeConsent({ analytics: false, marketing });

  it("sends the stored first touch with marketing consent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const sent = await recordSignupAttribution({ rpc } as never, jar({ [CONSENT_COOKIE]: consent(true), [ATTRIBUTION_COOKIE]: attr }));
    expect(sent).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_signup_attribution", {
      p: { first_seen_at: "2026-09-27T12:00:00.000Z", utm_source: "google", landing_path: "/pt-BR", platform: "web" },
    });
  });

  it("sends nothing without marketing consent, or without a stored first touch", async () => {
    const rpc = vi.fn();
    expect(await recordSignupAttribution({ rpc } as never, jar({ [CONSENT_COOKIE]: consent(false), [ATTRIBUTION_COOKIE]: attr }))).toBe(false);
    expect(await recordSignupAttribution({ rpc } as never, jar({ [ATTRIBUTION_COOKIE]: attr }))).toBe(false);
    expect(await recordSignupAttribution({ rpc } as never, jar({ [CONSENT_COOKIE]: consent(true) }))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws when the RPC fails", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    await expect(recordSignupAttribution({ rpc } as never, jar({ [CONSENT_COOKIE]: consent(true), [ATTRIBUTION_COOKIE]: attr }))).resolves.toBe(true);
  });
});
