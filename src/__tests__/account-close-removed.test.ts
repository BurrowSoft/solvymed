import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 244 (mob tester 2's hole): close_my_account refuses a patient a practice
// removed with P0001 'removed_by_practice', from the dry run on. The route,
// which the app calls, answers {code: "removed_by_practice"} (409) so the app
// offers the request form; any other refusal stays "generic". Before 244 the
// close goes through as before.

const h = vi.hoisted(() => ({
  calls: [] as string[],
  dryRunError: null as { message: string } | null,
  realError: null as { message: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1", email: "e2e-pat@example.invalid" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async (fn: string, args: { p_dry_run: boolean }) => {
      h.calls.push(`${fn}:${args.p_dry_run ? "dry" : "real"}`);
      return args.p_dry_run ? { data: null, error: h.dryRunError } : { data: [{ outcome: "deleted", kind: "none" }], error: h.realError };
    },
  }),
}));

import { POST as close } from "@/app/api/account/close/route";

const post = () => new NextRequest(new URL("/api/account/close", "https://www.solvymed.com"), { method: "POST" });

describe("/api/account/close: a patient a practice removed (244)", () => {
  beforeEach(() => {
    h.calls = [];
    h.dryRunError = null;
    h.realError = null;
  });

  it("the dry run's refusal answers removed_by_practice (409), and nothing is closed", async () => {
    h.dryRunError = { message: "removed_by_practice" };
    const res = await close(post());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "removed_by_practice" });
    expect(h.calls).toEqual(["close_my_account:dry"]);
  });

  it("the real run's refusal answers the same (a backstop)", async () => {
    h.realError = { message: "removed_by_practice" };
    const res = await close(post());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "removed_by_practice" });
  });

  it("any other dry-run refusal is still generic (500)", async () => {
    h.dryRunError = { message: "something else" };
    const res = await close(post());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "generic" });
  });

  it("before 244 (no refusal), the account is deleted as before", async () => {
    const res = await close(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "deleted" });
    expect(h.calls).toEqual(["close_my_account:dry", "close_my_account:real"]);
  });
});
