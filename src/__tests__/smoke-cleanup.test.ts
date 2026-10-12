import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addToLedger, deleteAccounts, ledgerPath, readLedger, SMOKE_EMAIL_RE, staleSmokeAccounts } from "../../e2e/smoke/admin";

// The smoke suite's cleanup (7e, 10-12): exact-tag sweep, and a failure that
// never stops the loop.

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const H = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();
const user = (email: string, createdAgo: number, id = email) => ({ id, email, created_at: iso(NOW - createdAgo) });

describe("the sweep's account choice", () => {
  it("matches only e2e-smoke-<14 digits><4 chars>-<tag>@burrowsoft.com", () => {
    expect(SMOKE_EMAIL_RE.test("e2e-smoke-20261008101500ab12-doc@burrowsoft.com")).toBe(true);
    for (const e of [
      "e2e-test-opus-20261008101500ab12-doc@burrowsoft.com",
      "e2e-test-t2-x@burrowsoft.com",
      "e2e-mt1-180@burrowsoft.com",
      "store-demo@solvymed.com",
      "maestro-e2e@burrowsoft.com",
      "vitor.goathik@gmail.com",
      "e2e-smoke-2026100810150ab12-doc@burrowsoft.com", // 13 digits
      "e2e-smoke-20261008101500ab1-doc@burrowsoft.com", // 3 characters
      "e2e-smoke-20261008101500ab12-doc@example.invalid",
      "e2e-smoke-20261008101500ab12-doc@burrowsoft.com.evil.io",
      "x-e2e-smoke-20261008101500ab12-doc@burrowsoft.com",
      "e2e-smoke-20261008101500AB12-doc@burrowsoft.com",
    ]) expect(SMOKE_EMAIL_RE.test(e), e).toBe(false);
  });

  it("takes other runs older than 2 h (by tag AND creation), never the current run or a younger one", () => {
    const tag = (t: number) => new Date(t).toISOString().replace(/\D/g, "").slice(0, 14);
    const old = tag(NOW - 4 * 24 * H);
    const recent = tag(NOW - 30 * 60_000);
    const users = [
      user(`e2e-smoke-${old}ab12-doc@burrowsoft.com`, 4 * 24 * H, "orphan-1"),
      user(`e2e-smoke-${old}ab12-pat@burrowsoft.com`, 4 * 24 * H, "orphan-2"),
      user(`e2e-smoke-${recent}cd34-doc@burrowsoft.com`, 30 * 60_000, "running-elsewhere"),
      // An old tag but created just now (E2E_RUN reused): too young.
      user(`e2e-smoke-${old}ef56-doc@burrowsoft.com`, 10 * 60_000, "reused-tag"),
      user(`e2e-smoke-${old}zz99-doc@burrowsoft.com`, 4 * 24 * H, "this-run"),
      user("e2e-test-opus-a@burrowsoft.com", 30 * 24 * H, "other-prefix"),
      { id: "no-email", email: null as unknown as string, created_at: iso(NOW - 30 * 24 * H) },
      { id: "no-created", email: `e2e-smoke-${old}gh78-doc@burrowsoft.com` },
      user("e2e-smoke-20261399999999ab12-doc@burrowsoft.com", 4 * 24 * H, "bad-date"),
    ];
    expect(staleSmokeAccounts(users, `${old}zz99`, NOW).map((u) => u.id)).toEqual(["orphan-1", "orphan-2"]);
  });
});

describe("cleanup never stops at a failure", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "smoke-ledger-"));
    vi.stubEnv("E2E_LEDGER_DIR", dir);
    vi.stubEnv("SUPABASE_URL", "https://db.example.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries, deletes the others, and leaves only the failed id in the ledger", async () => {
    const run = "20261012120000ab12";
    for (const id of ["u1", "u2", "u3"]) addToLedger(run, { id, email: `e2e-smoke-${run}-${id}@burrowsoft.com` });
    const calls: string[] = [];
    let blips = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      // u2: the network always fails (the 10-08 blip, for good).
      if (url.includes("u2")) throw new TypeError("fetch failed");
      // u3's user delete: one blip, then it works.
      if (url.endsWith("/admin/users/u3") && blips++ === 0) throw new TypeError("fetch failed");
      // u1 is already gone: 404 counts as deleted.
      if (url.endsWith("/admin/users/u1")) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    }));
    const done = deleteAccounts(run, readLedger(run).map((e) => e.id));
    await vi.runAllTimersAsync();
    expect(await done).toEqual(["u2"]);
    expect(readLedger(run).map((e) => e.id)).toEqual(["u2"]);
    // Newest first, and u1 still deleted after u2 failed.
    expect(calls.findIndex((c) => c.endsWith("/admin/users/u1"))).toBeGreaterThan(calls.findIndex((c) => c.includes("u2")));
    // u2: 1 try + 3 retries on its first step.
    expect(calls.filter((c) => c.includes("u2"))).toHaveLength(4);
  });

  it("removes the ledger file once everything is deleted", async () => {
    const run = "20261012120000cd34";
    addToLedger(run, { id: "u9", email: `e2e-smoke-${run}-u9@burrowsoft.com` });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await deleteAccounts(run, ["u9"])).toEqual([]);
    expect(existsSync(ledgerPath(run))).toBe(false);
  });
});
