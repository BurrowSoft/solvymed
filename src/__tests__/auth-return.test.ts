// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RETURN_COOKIE, loginWithReturn, returnFromCookie, returnPath, withReturn } from "@/lib/authReturn";
import { nameInitial } from "@/lib/doctorName";

// WT1's TH rehearsal (01, 10-28): a Patient Channel notice's link opened while signed out
// returns to that page after signing in (password or Google), only for its two exact
// shapes and only where the account was going anyway. And the doctor's own sidebar
// avatar never shows a Thai honorific's letter.

const PRO = "0b6f3c1e-1d2a-4c8e-9f00-123456789abc";
const REQ = "9d1e2f3a-4b5c-4d6e-8f70-abcdefabcdef";

describe("the return page (lib/authReturn)", () => {
  it("only the patient's channel page and the staff's request page, with or without a locale", () => {
    for (const ok of [`/my-appointments/channel/${PRO}`, `/th/my-appointments/channel/${PRO}`, `/pt-BR/my-appointments/channel/${PRO}`, `/dashboard/patient-channel/${REQ}`, `/th/dashboard/patient-channel/${REQ}`]) {
      expect(returnPath(ok), ok).toBe(ok);
    }
    for (const bad of [
      null, undefined, "", "/my-appointments", `/my-appointments/channel/${PRO}/x`, `/my-appointments/channel/${PRO}?x=1`,
      `//evil.example/my-appointments/channel/${PRO}`, `https://evil.example/my-appointments/channel/${PRO}`,
      `/xx/my-appointments/channel/${PRO}`, "/my-appointments/channel/not-a-uuid", `/dashboard/settings`, `/dashboard/patient-channel/${REQ.toUpperCase()}`,
      // cf: no backslash, no scheme, no encoded slashes or dots, no whitespace tricks.
      `/\\evil.example/my-appointments/channel/${PRO}`, `\\\\evil.example/my-appointments/channel/${PRO}`, `/%2F%2Fevil.example/my-appointments/channel/${PRO}`,
      `/th/my-appointments/channel/%2e%2e/${PRO}`, `/th/my-appointments/../dashboard/patient-channel/${REQ}`, ` /my-appointments/channel/${PRO}`,
      `/my-appointments/channel/${PRO}\n`, `javascript:/my-appointments/channel/${PRO}`, `/my-appointments/channel/${PRO}#x`,
    ]) {
      expect(returnPath(bad), String(bad)).toBeNull();
    }
  });

  it("each shape only where the account was going anyway: a patient's home, a staff member's dashboard", () => {
    const pc = `/th/my-appointments/channel/${PRO}`;
    const req = `/th/dashboard/patient-channel/${REQ}`;
    expect(withReturn("/th/my-appointments", pc)).toBe(pc);
    expect(withReturn("/th/dashboard", req)).toBe(req);
    // A doctor never lands on a patient page; a patient never on a staff page.
    expect(withReturn("/th/dashboard", pc)).toBe("/th/dashboard");
    expect(withReturn("/th/my-appointments", req)).toBe("/th/my-appointments");
    // The paywall, a pending patient, the invite form: unchanged.
    for (const dest of ["/th/subscribe", "/th/auth/pending-confirmation", "/th/auth/invite-required"]) {
      expect(withReturn(dest, pc)).toBe(dest);
      expect(withReturn(dest, req)).toBe(dest);
    }
    expect(withReturn("/th/my-appointments", "https://evil.example")).toBe("/th/my-appointments");
  });

  it("the sign-in address carries only a checked page; a bad cookie never throws", () => {
    expect(loginWithReturn("/th", `/th/my-appointments/channel/${PRO}`)).toBe(`/th/auth/login?next=${encodeURIComponent(`/th/my-appointments/channel/${PRO}`)}`);
    expect(loginWithReturn("/th", "/th/dashboard/settings")).toBe("/th/auth/login");
    expect(returnFromCookie(encodeURIComponent(`/my-appointments/channel/${PRO}`))).toBe(`/my-appointments/channel/${PRO}`);
    expect(returnFromCookie("%E0%A4%A")).toBeNull();
    expect(returnFromCookie(undefined)).toBeNull();
  });
});

describe("the doctor's own avatar letter", () => {
  it("skips หมอ / คุณหมอ like the dotted Thai titles; other names are unchanged", () => {
    expect(nameInitial("หมอสมชาย")).toBe("ส");
    expect(nameInitial("หมอ สมชาย")).toBe("ส");
    expect(nameInitial("คุณหมอสมศรี")).toBe("ส");
    expect(nameInitial("นพ.ธีรวัฒน์")).toBe("ธ");
    expect(nameInitial("Dra. Beatriz")).toBe("B");
    expect(nameInitial("หมอ")).toBe("ห");
  });
});

// The callback after Google: the cookie the sign-in page set (from ?next=).
const db = vi.hoisted(() => ({ dest: "/th/my-appointments" }));
vi.mock("@/lib/demoMetricsServer", () => ({ demoCountServer: async () => {} }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { session: {}, user: { id: "u1", user_metadata: {} } }, error: null }),
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: false, error: null }),
  }),
}));
vi.mock("@/lib/authRouting", () => ({ routeAfterAuth: async () => db.dest }));

type Handler = (req: NextRequest) => Promise<Response>;
let GET: Handler;
let middleware: Handler;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ GET } = (await import("@/app/api/auth/callback/route")) as { GET: Handler });
  ({ middleware } = (await import("@/middleware")) as { middleware: Handler });
});
beforeEach(() => {
  db.dest = "/th/my-appointments";
});

const call = (cookie?: string, q = "locale=th&google=login") =>
  GET(new NextRequest(new URL(`/api/auth/callback?code=abc&${q}`, "https://www.solvymed.com"), {
    headers: cookie === undefined ? {} : { cookie: `${RETURN_COOKIE}=${cookie}` },
  }));

describe("the callback after Google sign-in", () => {
  it("an existing patient back from Google with the cookie → the channel page; the cookie is cleared", async () => {
    const res = await call(encodeURIComponent(`/th/my-appointments/channel/${PRO}`));
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe(`/th/my-appointments/channel/${PRO}`);
    expect(to.searchParams.has("gr")).toBe(false);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${RETURN_COOKIE}=;`));
  });

  it("no cookie, a bad cookie, or the wrong account: the usual place, with gr=existing", async () => {
    for (const cookie of [undefined, "%E0%A4%A", encodeURIComponent("https://evil.example/")]) {
      const to = new URL((await call(cookie)).headers.get("location")!);
      expect(to.pathname, String(cookie)).toBe("/th/my-appointments");
      expect(to.searchParams.get("gr")).toBe("existing");
    }
    db.dest = "/th/dashboard";
    const to = new URL((await call(encodeURIComponent(`/th/my-appointments/channel/${PRO}`))).headers.get("location")!);
    expect(to.pathname).toBe("/th/dashboard");
  });
});

describe("signed-out visitors of a request link", () => {
  it("the dashboard's request page → sign-in with ?next=; any other dashboard page → plain sign-in", async () => {
    const go = async (path: string) => new URL((await middleware(new NextRequest(new URL(path, "https://www.solvymed.com")))).headers.get("location")!);
    const to = await go(`/th/dashboard/patient-channel/${REQ}`);
    expect(to.pathname).toBe("/th/auth/login");
    expect(to.searchParams.get("next")).toBe(`/th/dashboard/patient-channel/${REQ}`);
    const plain = await go("/th/dashboard/settings");
    expect(plain.pathname).toBe("/th/auth/login");
    expect(plain.searchParams.has("next")).toBe(false);
  });
});
