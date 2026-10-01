// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 3e's #279 ❌: /auth/signup?country=BR was a 404 and /th/…?country=TH
// rendered in English. ?country= is the middleware's dev geo override,
// which drops next-intl's rewrite and locale. The country step uses ?c=,
// which must route exactly like the bare page.

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ middleware } = (await import("@/middleware")) as { middleware: Middleware });
});

const routing = async (path: string, locale: string) => {
  const res = await middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers: { cookie: `NEXT_LOCALE=${locale}` } }));
  const rewrite = res.headers.get("x-middleware-rewrite");
  return {
    status: res.status,
    rewrite: rewrite ? new URL(rewrite).pathname : null,
    locale: res.headers.get("x-middleware-request-x-next-intl-locale"),
  };
};

describe("the signup's ?c= routes like the bare page", () => {
  it.each([
    ["/auth/signup", "en"],
    ["/pt-BR/auth/signup", "pt-BR"],
    ["/th/auth/signup", "th"],
  ])("%s?c=… = %s", async (path, locale) => {
    const bare = await routing(path, locale);
    const withC = await routing(`${path}?c=${locale === "th" ? "TH" : "BR"}`, locale);
    expect(withC.status).toBe(bare.status);
    expect(withC.rewrite).toBe(bare.rewrite);
    expect(withC.locale).toBe(bare.locale);
  });

  it("English is rewritten to its /en route (never a 404)", async () => {
    const r = await routing("/auth/signup?c=BR", "en");
    expect(r.status).toBeLessThan(300);
    expect(r.rewrite).toBe("/en/auth/signup");
  });
});

describe("?country= is just a query parameter (the dev geo branch is gone)", () => {
  it.each([
    ["/auth/signup", "en"],
    ["/th/auth/signup", "th"],
    ["/pt-BR/pricing", "pt-BR"],
  ])("%s?country=… routes like the bare page", async (path, locale) => {
    const bare = await routing(path, locale);
    const withCountry = await routing(`${path}?country=TH`, locale);
    expect(withCountry.status).toBe(bare.status);
    expect(withCountry.rewrite).toBe(bare.rewrite);
    expect(withCountry.locale).toBe(bare.locale);
  });
});
