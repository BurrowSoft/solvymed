import { deleteAccounts, hasServiceKey, listUsers, log, newRunTag, RUN_RE, staleSmokeAccounts } from "./admin";

// Before the tests: one run tag for the whole run (the worker and the
// teardown read E2E_RUN), then the sweep of older runs' leftovers: only
// e2e-smoke-<14 digits><4 chars>-…@burrowsoft.com accounts whose run tag and
// creation are both more than 2 h old (a run in progress elsewhere is
// younger). Every swept account is logged. Without the service key (the
// public specs alone) there is nothing to sweep.
export default async function globalSetup() {
  if (!process.env.E2E_RUN) process.env.E2E_RUN = newRunTag();
  const run = process.env.E2E_RUN;
  if (!RUN_RE.test(run)) throw new Error("E2E_RUN must be a full run tag (yyyymmddHHMMss + 4 characters)");
  log(`run ${run}`);
  if (!hasServiceKey()) {
    log("sweep: skipped (no service key)");
    return;
  }
  try {
    const stale = staleSmokeAccounts(await listUsers(), run, Date.now());
    log(`sweep: ${stale.length} leftover smoke accounts older than 2 h`, stale.map((s) => `${s.email} = ${s.id}`));
    if (!stale.length) return;
    const failed = await deleteAccounts(run, stale.map((s) => s.id));
    log(`sweep: ${stale.length - failed.length}/${stale.length} deleted${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
  } catch (e) {
    // The sweep never blocks the run; the next run tries again.
    log(`sweep FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
