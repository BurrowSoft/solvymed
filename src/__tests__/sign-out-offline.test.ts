import { describe, expect, it, vi } from "vitest";
import { signOutHere } from "@/lib/signOut";

// 1.9.0 offline guard (7e's #512 row): offline, the server sign-out fails
// and the auth client kept the session: this browser stayed signed in.

describe("signOutHere", () => {
  it("the server answers: one sign-out, everywhere", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await signOutHere({ signOut });
    expect(signOut.mock.calls).toEqual([[]]);
  });
  it("the server can't be reached (an error, or a throw): this browser's session is removed anyway", async () => {
    const failing = vi.fn(async (opts?: { scope?: string }) => (opts?.scope === "local" ? { error: null } : { error: { name: "AuthRetryableFetchError" } }));
    await signOutHere({ signOut: failing });
    expect(failing.mock.calls).toEqual([[], [{ scope: "local" }]]);
    const throwing = vi.fn(async (opts?: { scope?: string }) => { if (!opts) throw new TypeError("Failed to fetch"); return { error: null }; });
    await signOutHere({ signOut: throwing });
    expect(throwing.mock.calls).toEqual([[], [{ scope: "local" }]]);
  });
});
