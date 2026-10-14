// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// solvymed.com/app (Vitor: the link in the video descriptions and posters): a
// 302 to the Play listing with a fixed referrer, before the locale and auth
// handling, without cookies; nothing of the visitor's passed on (d6).

const auth = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => { auth.calls++; return { data: { user: null } }; } } }),
}));

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ middleware } = (await import("@/middleware")) as { middleware: Middleware });
});

const TARGET = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed&referrer=utm_source%3Dsolvymed%26utm_medium%3Dshortlink";
const get = (path: string, headers: Record<string, string> = {}) =>
  middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers: { "accept-language": "pt-BR,pt;q=0.9", ...headers } }));

describe("solvymed.com/app", () => {
  it.each(["/app", "/app/", "/pt-BR/app", "/th/app", "/en/app", "/pt/app", "/PT-br/app", "/APP"])("%s → 302 to the Play listing, exactly", async (path) => {
    auth.calls = 0;
    const res = await get(path);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(TARGET);
    // Before the session refresh and the locale cookie: nothing set, nothing read.
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(auth.calls).toBe(0);
  });

  it("the visitor's own query never reaches the store", async () => {
    const res = await get("/app?utm_source=x&utm_content=me&gclid=abc");
    expect(res.headers.get("location")).toBe(TARGET);
  });

  it("other paths that start with app are untouched", async () => {
    for (const path of ["/appointments", "/app/x", "/dashboard/app", "/pt-BR/apple"]) {
      const res = await get(path);
      expect(res.headers.get("location") ?? "", path).not.toBe(TARGET);
    }
  });
});
