// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Signed out: no Supabase call leaves the test.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  // The off switch: Thai hidden (the flag is read when the module loads).
  vi.stubEnv("NEXT_PUBLIC_THAI_ENABLED", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ middleware } = (await import("@/middleware")) as { middleware: Middleware });
});

// Follows redirects like a browser, carrying the cookies the responses set
// or delete, until a non-redirect response.
async function browse(path: string, cookies: Record<string, string>, maxHops = 5) {
  const jar = { ...cookies };
  let url = new URL(path, "https://solvymed.com");
  const hops: string[] = [];
  for (let i = 0; i <= maxHops; i++) {
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await middleware(new NextRequest(url, { headers: { cookie, "accept-language": "th-TH,th;q=0.9" } }));
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === "") delete jar[name];
      else jar[name] = value;
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) {
      return { status: res.status, path: url.pathname, hops, cookie: jar.NEXT_LOCALE };
    }
    url = new URL(location, url);
    hops.push(url.pathname);
  }
  throw new Error(`redirect loop: ${hops.join(" → ")}`);
}

describe("middleware: a NEXT_LOCALE cookie for a hidden language (Thai, flag off)", () => {
  it.each(["/", "/auth/login", "/privacy"])("%s ends on an unprefixed page, cookie rewritten", async (path) => {
    const r = await browse(path, { NEXT_LOCALE: "th" });
    expect(r.status).toBeLessThan(300);
    expect(r.path).toBe(path);
    expect(r.hops.length).toBeLessThanOrEqual(1);
    expect(r.cookie).not.toBe("th");
  });

  it("/th/auth/login ends on /auth/login", async () => {
    const r = await browse("/th/auth/login?next=%2Fdashboard", { NEXT_LOCALE: "th" });
    expect(r.status).toBeLessThan(300);
    expect(r.path).toBe("/auth/login");
    expect(r.hops.length).toBeLessThanOrEqual(2);
    expect(r.cookie).not.toBe("th");
  });

  it("/dashboard (signed out) ends on the login page", async () => {
    const r = await browse("/dashboard", { NEXT_LOCALE: "th" });
    expect(r.status).toBeLessThan(300);
    expect(r.path).toBe("/auth/login");
    expect(r.hops.length).toBeLessThanOrEqual(2);
    expect(r.cookie).not.toBe("th");
  });

  it("a public-language cookie is left alone", async () => {
    const r = await browse("/", { NEXT_LOCALE: "de" });
    expect(r.path).toBe("/de");
    expect(r.cookie).toBe("de");
  });
});
