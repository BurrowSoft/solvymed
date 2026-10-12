import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The smoke suite's service-role side: the run tag, the ledger of the
// accounts a run created, deleting them (with retries) and the sweep of
// older runs' leftovers. Shared by the fixtures (in the worker) and the
// global setup / teardown (in the runner). No Playwright imports here.
//
// Why (7e, 10-12): a network blip in afterAll threw out of cleanup()'s loop
// and left 3 accounts on production. Now one failure never stops the loop,
// every created id is written down before the test goes on, the teardown
// retries what is still listed, and the next run sweeps exact-tag leftovers.

export function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k} (see e2e/smoke/README.md)`);
  return v;
}
export const sb = () => need("SUPABASE_URL");
export const service = () => {
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
};
export const hasServiceKey = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const log = (...a: unknown[]) => console.log("[smoke]", ...a);

// ── The run tag ──
// yyyymmddHHMMss (UTC) + 4 random characters. The global setup makes one and
// puts it in E2E_RUN, so the worker (even a restarted one) and the teardown
// share it.
export const RUN_RE = /^\d{14}[a-z0-9]{4}$/;
export function newRunTag(now = new Date()): string {
  return `${now.toISOString().replace(/\D/g, "").slice(0, 14)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
}

// Exactly the smoke suite's accounts: e2e-smoke-<14 digits><4 chars>-<tag>@burrowsoft.com.
// Nothing else matches (e2e-test-*, e2e-mt*-*, store-demo, maestro, Vitor's
// accounts): the sweep below relies on it.
export const SMOKE_EMAIL_RE = /^e2e-smoke-(\d{14})([a-z0-9]{4})-[a-z0-9-]+@burrowsoft\.com$/;

// The run's time from its tag (UTC), or null when it isn't a real date.
export function runTime(run14: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(run14);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  // Date.UTC rolls an impossible date over (month 13 → next January): only a
  // tag that formats back to itself is a real date (ec).
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().replace(/\D/g, "").slice(0, 14) === run14 ? t : null;
}

// ── The ledger: test-results/smoke-created-<RUN>.json ──
// git-ignored. Playwright empties test-results/ before the global setup, so a
// ledger lives for one run; older runs' leftovers are the sweep's job.
export type Entry = { id: string; email: string };
// E2E_LEDGER_DIR only for the unit tests.
const ledgerDir = () => process.env.E2E_LEDGER_DIR ?? join(process.cwd(), "test-results");
export const ledgerPath = (run: string) => join(ledgerDir(), `smoke-created-${run}.json`);

export function readLedger(run: string): Entry[] {
  try {
    const v = JSON.parse(readFileSync(ledgerPath(run), "utf8")) as unknown;
    return Array.isArray(v) ? (v as Entry[]) : [];
  } catch {
    return [];
  }
}
export function writeLedger(run: string, entries: Entry[]): void {
  const p = ledgerPath(run);
  if (!entries.length) {
    rmSync(p, { force: true });
    return;
  }
  mkdirSync(ledgerDir(), { recursive: true });
  writeFileSync(p, JSON.stringify(entries, null, 2));
}
export function addToLedger(run: string, e: Entry): void {
  writeLedger(run, [...readLedger(run).filter((x) => x.id !== e.id), e]);
}
export function removeFromLedger(run: string, id: string): void {
  writeLedger(run, readLedger(run).filter((x) => x.id !== id));
}

// ── Deleting ──

// fn, retried up to 3 times (1 s, 2 s, 4 s) when it throws.
export async function withRetries<T>(what: string, fn: () => Promise<T>, waits = [1000, 2000, 4000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= waits.length) throw e;
      log(`${what}: ${e instanceof Error ? e.message : String(e)}; retry ${i + 1}/${waits.length}`);
      await sleep(waits[i]);
    }
  }
}

// Rows that keep a doctor alive by design: deleted first.
const BLOCKING = ["appointments", "procedures", "secretary_invites", "patients"];

// One account: its blocking rows, then the user. Throws when any step still
// fails after the retries. A user that is already gone (404) counts as deleted.
export async function deleteAccount(id: string): Promise<void> {
  for (const t of BLOCKING) {
    await withRetries(`delete ${t} of ${id}`, async () => {
      const r = await fetch(`${sb()}/rest/v1/${t}?professional_id=eq.${id}`, { method: "DELETE", headers: service(), signal: AbortSignal.timeout(60_000) });
      if (r.status >= 300) throw new Error(`${t} → ${r.status}`);
    });
  }
  await withRetries(`delete user ${id}`, async () => {
    const r = await fetch(`${sb()}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: service(), signal: AbortSignal.timeout(60_000) });
    if (r.status >= 300 && r.status !== 404) throw new Error(`user → ${r.status}`);
  });
}

// Deletes every id (newest first); one failure never stops the others. Each
// deleted id leaves the ledger; the failed ones stay there for the teardown.
// Returns the ids that failed.
export async function deleteAccounts(run: string, ids: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const id of [...ids].reverse()) {
    try {
      await deleteAccount(id);
      removeFromLedger(run, id);
    } catch (e) {
      failed.push(id);
      log(`cleanup FAILED for user ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failed;
}

// Every auth user, page by page.
export async function listUsers(): Promise<{ id: string; email: string; created_at?: string }[]> {
  const all: { id: string; email: string; created_at?: string }[] = [];
  for (let p = 1; p < 50; p++) {
    const r = await withRetries(`list users page ${p}`, async () => {
      const res = await fetch(`${sb()}/auth/v1/admin/users?per_page=200&page=${p}`, { headers: service(), signal: AbortSignal.timeout(60_000) });
      if (res.status >= 300) throw new Error(`list users → ${res.status}`);
      return (await res.json()) as { users?: { id: string; email: string; created_at?: string }[] };
    });
    const us = r.users ?? [];
    if (!us.length) break;
    all.push(...us);
  }
  return all;
}

// The sweep's choice, pure (tested): smoke accounts of OTHER runs whose run
// tag AND creation time are both more than `minAgeMs` old.
export function staleSmokeAccounts(
  users: { id: string; email: string | null | undefined; created_at?: string }[],
  currentRun: string,
  now: number,
  minAgeMs = 2 * 3_600_000,
): Entry[] {
  return users.flatMap((u) => {
    const m = SMOKE_EMAIL_RE.exec(u.email ?? "");
    if (!m || `${m[1]}${m[2]}` === currentRun) return [];
    const tagged = runTime(m[1]);
    const created = u.created_at ? Date.parse(u.created_at) : NaN;
    if (tagged === null || Number.isNaN(created)) return [];
    if (now - tagged <= minAgeMs || now - created <= minAgeMs) return [];
    return [{ id: u.id, email: u.email as string }];
  });
}
