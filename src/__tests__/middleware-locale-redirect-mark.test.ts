// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Funnel F2 (b9): a language the site picked for the visitor (the NEXT_LOCALE
// cookie or the browser language) is marked ?lr=1 on its redirect, so the
// signup doesn't take the practice country from it. A path the visitor
// opened themselves is never marked.

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

const get = (path: string, headers: Record<string, string>) =>
  middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers }));

describe("automatic locale redirects carry ?lr=1", () => {
  it("the NEXT_LOCALE cookie's redirect (next-intl), query kept", async () => {
    const res = await get("/auth/signup?utm_source=x", { cookie: "NEXT_LOCALE=pt-BR" });
    expect(res.status).toBeGreaterThanOrEqual(300);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/pt-BR/auth/signup");
    expect(to.searchParams.get("lr")).toBe("1");
    expect(to.searchParams.get("utm_source")).toBe("x");
  });

  it("the first visit's browser-language redirect", async () => {
    const res = await get("/", { "accept-language": "pt-BR,pt;q=0.9" });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/pt-BR");
    expect(to.searchParams.get("lr")).toBe("1");
  });

  it.each(["/pt-BR/auth/signup", "/th/auth/signup", "/pt-BR"])("%s opened by the visitor: no redirect, no mark", async (path) => {
    const res = await get(path, { cookie: "NEXT_LOCALE=en" });
    expect(res.headers.get("location") ?? "").not.toContain("lr=1");
  });

  it("English stays unprefixed and unmarked", async () => {
    const res = await get("/auth/signup", { cookie: "NEXT_LOCALE=en" });
    expect(res.headers.get("location")).toBeNull();
  });
});
