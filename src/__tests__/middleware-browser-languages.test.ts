// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// country-preselect, 13's ❌ on #484: on a first visit picked as English the
// middleware pins Accept-Language to "en" for next-intl; the browser's own
// list still reaches the signup (BROWSER_LANGUAGES_HEADER) for its country
// suggestion.

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_THAI_ENABLED", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ middleware } = (await import("@/middleware")) as { middleware: Middleware });
});

// The request headers the page sees (Next passes overrides as x-middleware-request-*).
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe("first visit, English picked: the browser's languages survive the pin", () => {
  it("en-US,en;q=0.9,pt-BR;q=0.8 → the page sees en for next-intl and the full list for the suggestion", async () => {
    const list = "en-US,en;q=0.9,pt-BR;q=0.8";
    const res = await middleware(new NextRequest("https://solvymed.com/auth/signup", { headers: { "accept-language": list } }));
    expect(res.status).toBeLessThan(300);
    expect(forwarded(res, "accept-language")).toBe("en");
    expect(forwarded(res, "x-solvymed-browser-languages")).toBe(list);
  });
});
