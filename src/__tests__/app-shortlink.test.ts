// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// solvymed.com/app (Vitor: the link in the video descriptions and posters),
// before the locale and auth handling, without cookies. Funnel F6: an
// Android phone → a 302 to the Play listing with the fixed referrer, or the
// visit's utm_source/medium/campaign with marketing consent (privacy §3.6);
// anything else → the landing with the utm kept (and nothing else).

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
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const marketing = (on: boolean) => `sm_consent=1.${on ? "11" : "10"}.${Math.floor(Date.now() / 1000)}`;
const get = (path: string, headers: Record<string, string> = {}) =>
  middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers: { "accept-language": "pt-BR,pt;q=0.9", ...headers } }));

describe("solvymed.com/app on an Android phone", () => {
  it.each(["/app", "/app/", "/pt-BR/app", "/th/app", "/en/app", "/pt/app", "/PT-br/app", "/APP"])("%s → 302 to the Play listing, exactly", async (path) => {
    auth.calls = 0;
    const res = await get(path, { "user-agent": ANDROID });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(TARGET);
    // Before the session refresh and the locale cookie: nothing set, nothing read.
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(auth.calls).toBe(0);
  });

  it("without marketing consent the visitor's query never reaches the store", async () => {
    for (const cookie of ["", marketing(false)]) {
      const res = await get("/app?utm_source=x&utm_campaign=ep07&gclid=abc", { "user-agent": ANDROID, cookie });
      expect(res.headers.get("location")).toBe(TARGET);
    }
  });

  it("with marketing consent: utm_source/medium/campaign as the referrer, never click ids or other keys", async () => {
    const res = await get("/app?utm_source=youtube&utm_medium=video&utm_campaign=ep07&utm_content=me&gclid=abc", { "user-agent": ANDROID, cookie: marketing(true) });
    const to = new URL(res.headers.get("location")!);
    expect(to.hostname).toBe("play.google.com");
    expect(to.searchParams.get("referrer")).toBe("utm_source=youtube&utm_medium=video&utm_campaign=ep07");
  });
});

describe("solvymed.com/app anywhere else → the landing", () => {
  it.each([
    [IPHONE, "/app", "/"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0", "/pt-BR/app", "/pt-BR"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/129.0 Safari/537.36", "/th/app/", "/th"], // a tablet
  ])("%s %s → %s, utm kept, nothing else", async (ua, path, landing) => {
    auth.calls = 0;
    const res = await get(`${path}?utm_source=youtube&utm_campaign=ep07&gclid=abc&email=a%40b.co`, { "user-agent": ua });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe("https://www.solvymed.com");
    expect(to.pathname).toBe(landing);
    expect([...to.searchParams.keys()]).toEqual(["utm_source", "utm_campaign"]);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(auth.calls).toBe(0);
  });
});

describe("solvymed.com/app: unrelated paths", () => {

  it("other paths that start with app are untouched", async () => {
    for (const path of ["/appointments", "/app/x", "/dashboard/app", "/pt-BR/apple"]) {
      const res = await get(path);
      expect(res.headers.get("location") ?? "", path).not.toBe(TARGET);
    }
  });
});
