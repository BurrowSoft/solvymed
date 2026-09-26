import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The callback must never verify a one-time token on GET (mail scanners
// open links first), and must never talk to Supabase for one.
const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: (...args: unknown[]) => createServerClient(...args) }));

const { GET } = await import("@/app/api/auth/callback/route");

beforeEach(() => createServerClient.mockReset());

function get(url: string) {
  return GET(new NextRequest(new URL(url, "https://www.solvymed.com")));
}

describe("/api/auth/callback with a one-time token", () => {
  it("sends a recovery link to the verify page without verifying it", async () => {
    const res = await get("/api/auth/callback?token_hash=abc123&type=recovery&locale=pt-BR");
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/pt-BR/auth/verify");
    expect(to.searchParams.get("token_hash")).toBe("abc123");
    expect(to.searchParams.get("type")).toBe("recovery");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("keeps en unprefixed and defaults the type to signup", async () => {
    const res = await get("/api/auth/callback?token_hash=xyz&locale=en");
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/auth/verify");
    expect(to.searchParams.get("type")).toBe("signup");
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
