import { describe, expect, it } from "vitest";
import { attempt, hasServerCode, isNetworkError, NETWORK_FAILURE, safeCall } from "@/lib/netError";
import { isAccessLogRefusal } from "@/lib/accessLog";

// The classifier table (specs/offline-guard.md §3, 1.9.0).

describe("isNetworkError: a thrown error that means no answer", () => {
  it.each([
    ["Chrome's fetch failure", new TypeError("Failed to fetch"), true],
    ["Firefox's", new TypeError("NetworkError when attempting to fetch resource."), true],
    ["Safari's", new TypeError("Load failed"), true],
    ["Node's / undici's", new TypeError("fetch failed"), true],
    ["the offline guard's (a TypeError)", Object.assign(new TypeError("Failed to fetch (offline)"), { name: "OfflineBlockedError" }), true],
    ["an abort", Object.assign(new Error("The user aborted a request."), { name: "AbortError" }), true],
    ["a timeout", Object.assign(new Error("signal timed out"), { name: "TimeoutError" }), true],
    ["a plain Error with a network message", new Error("Network request failed"), true],
    ["a bug (ReferenceError)", new ReferenceError("x is not defined"), false],
    ["a server-side error message", new Error("permission denied for table patients"), false],
    ["nothing", null, false],
    ["a string", "Failed to fetch", false],
  ])("%s", (_, e, net) => expect(isNetworkError(e)).toBe(net));
});

describe("hasServerCode: a returned refusal", () => {
  it.each([
    [{ code: "42501", message: "permission denied" }, true],
    [{ code: "P0001", message: "not_found" }, true],
    [{ code: "PGRST116" }, true],
    [{ code: "", message: "TypeError: fetch failed" }, false],
    [{ code: "  " }, false],
    [{ message: "fetch failed" }, false],
    [{ code: null }, false],
    [null, false],
  ] as [{ code?: string | null; message?: string } | null, boolean][])("%j → %s", (e, refused) => {
    expect(hasServerCode(e)).toBe(refused);
    // The access-log rule (#502) is the same rule.
    expect(isAccessLogRefusal(e)).toBe(refused);
  });
});

describe("attempt", () => {
  it("returns the value; anything thrown becomes { ok: false }, flagged network or not", async () => {
    expect(await attempt(async () => 7)).toEqual({ ok: true, value: 7 });
    expect(await attempt(async () => { throw new TypeError("Failed to fetch"); })).toEqual({ ok: false, network: true });
    expect(await attempt(async () => { throw new Error("An error occurred in the Server Components render."); })).toEqual({ ok: false, network: false });
  });
});

describe("safeCall", () => {
  it("returns the answer, or the given failure for anything thrown", async () => {
    expect(await safeCall(async () => ({ ok: true }), NETWORK_FAILURE)).toEqual({ ok: true });
    expect(await safeCall(async () => ({ ok: false, code: "denied" }), NETWORK_FAILURE)).toEqual({ ok: false, code: "denied" });
    expect(await safeCall(async () => { throw new TypeError("Failed to fetch"); }, NETWORK_FAILURE)).toEqual({ ok: false, code: "network" });
  });
});
