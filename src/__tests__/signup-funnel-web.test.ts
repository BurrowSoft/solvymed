// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { VERIFY_METRICS, isInAppBrowser, isVerifyMetric } from "@/lib/authFunnel";

// The sign-up funnel's web fixes (specs/signup-funnel-fixes.md; 01's GO, 10-28):
// (a) a Google round trip that doesn't finish says so on the sign-in page, reported by its
// code only and counted; (b) app browsers where Google refuses sign-in; (c) the verify
// page's totals and the neutral resend on the expired card.

const h = vi.hoisted(() => ({
  exchange: { data: { session: null, user: null }, error: { code: "flow_state_not_found", message: "invalid flow state" } } as unknown,
  counts: [] as string[],
  sentry: [] as { msg: string; tags: unknown }[],
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: (msg: string, ctx: { tags: unknown }) => { h.sentry.push({ msg, tags: ctx.tags }); } }));
vi.mock("@/lib/authFunnelServer", () => ({ authFunnelCount: async (...a: (string | null)[]) => { h.counts.push(a.map((x) => x ?? "-").join(" ")); } }));
vi.mock("@/lib/demoMetricsServer", () => ({ demoCountServer: async () => {} }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: async () => h.exchange },
    rpc: async () => ({ data: false, error: null }),
  }),
}));
vi.mock("@/lib/authRouting", () => ({ routeAfterAuth: async (_s: unknown, _u: unknown, prefix: string) => `${prefix}/dashboard` }));

type Handler = (req: NextRequest) => Promise<Response>;
let GET: Handler;
let FUNNEL: Handler;
// The route's own instance (after resetModules), so the test resets the limit it counts.
let resetFunnelLimit: () => void;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ GET } = (await import("@/app/api/auth/callback/route")) as { GET: Handler });
  ({ POST: FUNNEL } = (await import("@/app/api/auth/funnel/route")) as { POST: Handler });
  ({ resetFunnelLimit } = await import("@/lib/authFunnel"));
});
beforeEach(() => {
  h.exchange = { data: { session: null, user: null }, error: { code: "flow_state_not_found", message: "invalid flow state" } };
  h.counts = [];
  h.sentry = [];
  resetFunnelLimit();
});

const site = "https://www.solvymed.com";
const call = (q: string, cookie?: string) => {
  const req = new NextRequest(new URL(`/api/auth/callback?${q}`, site));
  if (cookie) req.cookies.set("sm_auth_return", cookie);
  return GET(req);
};
const loc = (res: Response) => new URL(res.headers.get("location")!);

describe("(a) a Google round trip that doesn't finish", () => {
  it("the exchange fails → /auth/login?google=failed; Sentry gets the code only; one daily count", async () => {
    const res = await call("code=abc&locale=pt-BR&google=signup&c=BR&role=professional");
    expect(loc(res).pathname).toBe("/pt-BR/auth/login");
    expect(Object.fromEntries(loc(res).searchParams)).toEqual({ google: "failed" });
    expect(h.sentry).toEqual([{ msg: "google_exchange_failed", tags: { code: "flow_state_not_found" } }]);
    expect(h.counts).toEqual(["google_exchange_failed BR pt-BR"]);
  });

  it("no session without an error code → no_session; Google's ?error= → its code", async () => {
    h.exchange = { data: { session: null, user: null }, error: null };
    await call("code=abc&locale=th&google=login");
    expect(h.sentry[0].tags).toEqual({ code: "no_session" });
    const res = await call("locale=th&google=login&error=access_denied&error_description=The+user+denied");
    expect(loc(res).pathname).toBe("/th/auth/login");
    expect(loc(res).searchParams.get("google")).toBe("failed");
    expect(h.sentry[1].tags).toEqual({ code: "access_denied" });
    expect(h.counts).toEqual(["google_exchange_failed - th", "google_exchange_failed - th"]);
  });

  it("a Patient Channel page being returned to stays the sign-in page's ?next=", async () => {
    const path = "/th/my-appointments/channel/0b0c3e0e-6a41-4f5e-9d55-3c8f2d1b7a10";
    const res = await call("code=abc&locale=th&google=login", encodeURIComponent(path));
    expect(loc(res).searchParams.get("next")).toBe(path);
    expect(res.headers.get("set-cookie")).toMatch(/sm_auth_return=;/);
  });

  it("not from our Google button: unchanged (plain sign-in page, home for no code), nothing reported", async () => {
    let res = await call("code=abc&locale=en");
    expect(loc(res).pathname).toBe("/auth/login");
    expect(loc(res).search).toBe("");
    res = await call("locale=en&error=access_denied");
    expect(loc(res).pathname).toBe("/");
    expect(h.sentry).toEqual([]);
    expect(h.counts).toEqual([]);
  });

  it("the sign-in page shows the line from ?google=failed (en/pt approved by 01)", () => {
    const page = readFileSync("src/app/[locale]/(site)/auth/login/page.tsx", "utf8");
    expect(page).toContain('searchParams.get(GOOGLE_FAILED_PARAM) === GOOGLE_FAILED_VALUE ? t("google.exchangeFailed")');
    const msg = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8").trimStart()).auth.google;
    expect(msg("en").exchangeFailed).toBe("We couldn't finish signing in with Google. Tap 'Continue with Google' again or use e-mail and password.");
    expect(msg("pt-BR").exchangeFailed).toBe("Não conseguimos concluir a entrada com o Google. Toque em 'Continuar com Google' de novo ou use e-mail e senha.");
  });
});

describe("(b) app browsers where Google refuses sign-in", () => {
  it("Instagram, Facebook and LINE are detected; ordinary browsers aren't", () => {
    const yes = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.104 (iPhone14,5; iOS 17_5; pt_BR)",
      "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/468.0.0.55.105;]",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.37.106;]",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Line/14.9.1/IAB",
    ];
    const no = [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "",
    ];
    for (const ua of yes) expect(isInAppBrowser(ua), ua).toBe(true);
    for (const ua of no) expect(isInAppBrowser(ua), ua).toBe(false);
    expect(isInAppBrowser(null)).toBe(false);
  });

  it("the strings exist in every locale (en/pt approved by 01; th drafted for Vitor)", () => {
    const locales = ["ar", "de", "en", "es", "fr", "id", "it", "ja", "ko", "pt-BR", "ru", "th", "vi", "zh", "zh-TW"];
    for (const l of locales) {
      const m = JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8").trimStart()).auth;
      for (const k of ["title", "body", "copy", "copied"]) expect(m.google.inApp[k]?.trim(), `${l} ${k}`).toBeTruthy();
      expect(m.google.exchangeFailed?.trim(), l).toBeTruthy();
      // The line names the button as the page shows it.
      expect(m.google.exchangeFailed, l).toContain(m.google.continue);
      expect(m.verify.resendHint?.trim(), l).toBeTruthy();
    }
  });
});

describe("(c) the verify page's totals", () => {
  const post = (body: unknown, origin: string | null = site, ip = "203.0.113.7") =>
    FUNNEL(new NextRequest(new URL("/api/auth/funnel", site), {
      method: "POST",
      body: JSON.stringify(body),
      headers: { ...(origin ? { origin } : {}), "content-type": "application/json", "x-forwarded-for": ip },
    }));

  it("counts the listed metrics only, from this site only, with the locale, no country, platform web", async () => {
    expect(VERIFY_METRICS).toEqual(["verify_view", "verify_continue_ok", "verify_expired", "verify_resend"]);
    for (const m of ["verify_view", "verify_expired", "verify_resend"]) expect((await post({ metric: m, locale: "th" })).status).toBe(204);
    await post({ metric: "verify_view", locale: "xx" });
    // verify_continue_ok is counted by after-verify (after the session is set), never from here.
    await post({ metric: "verify_continue_ok", locale: "th" });
    await post({ metric: "anything", locale: "th" });
    await post({ metric: "verify_view", locale: "th" }, "https://evil.example");
    expect(h.counts).toEqual(["verify_view - th web", "verify_expired - th web", "verify_resend - th web", "verify_view - en web"]);
    expect(isVerifyMetric("google_exchange_failed")).toBe(false);
  });

  it("the app's confirm panel (no Origin): platform android / ios, all four metrics; any other platform is web", async () => {
    await post({ metric: "verify_continue_ok", locale: "pt-BR", platform: "android" }, null);
    await post({ metric: "verify_view", locale: "th", platform: "ios" }, null);
    await post({ metric: "verify_expired", locale: "th", platform: "windows" }, null);
    await post({ metric: "verify_continue_ok", locale: "th", platform: "desktop" }, null);
    expect(h.counts).toEqual(["verify_continue_ok - pt-BR android", "verify_view - th ios", "verify_expired - th web"]);
  });

  it("a per-IP limit (30 per 10 minutes; cf's item 6), and nothing without an address", async () => {
    for (let i = 0; i < 35; i++) await post({ metric: "verify_view", locale: "th" });
    expect(h.counts).toHaveLength(30);
    await post({ metric: "verify_view", locale: "th" }, site, "198.51.100.9");
    expect(h.counts).toHaveLength(31);
    await post({ metric: "verify_view", locale: "th" }, site, "");
    expect(h.counts).toHaveLength(31);
  });

  it("after-verify counts verify_continue_ok for a sign-up confirmation only", () => {
    const route = readFileSync("src/app/api/auth/after-verify/route.ts", "utf8");
    expect(route).toContain('if (isSignup) await authFunnelCount("verify_continue_ok", null, locale);');
  });

  it("the expired card: an e-mail field + the NEUTRAL resend (never tells whether the address has an account)", () => {
    const page = readFileSync("src/app/[locale]/(site)/auth/verify/VerifyClient.tsx", "utf8");
    expect(page).toContain('<ResendConfirmation email={resendEmail} locale={locale} neutral onSend={() => countFunnel("verify_resend", locale)} />');
    // Nothing about the visitor in the count: the metric and the language only.
    expect(page).toContain("body: JSON.stringify({ metric, locale }),");
  });
});
