import { deleteAccounts, hasServiceKey, ledgerPath, log, readLedger } from "./admin";

// After the tests: anything still in the run's ledger (afterAll failed, or a
// worker died before it) is deleted now, with the same retries. What still
// fails stays in the ledger file and is printed, and the next run's sweep
// deletes it once it is 2 h old.
export default async function globalTeardown() {
  const run = process.env.E2E_RUN;
  if (!run || !hasServiceKey()) return;
  const left = readLedger(run);
  if (!left.length) {
    log(`teardown: nothing left (run ${run})`);
    return;
  }
  log(`teardown: ${left.length} accounts still listed (run ${run})`, left.map((e) => `${e.email} = ${e.id}`));
  const failed = await deleteAccounts(run, left.map((e) => e.id));
  if (failed.length) log(`teardown: STILL NOT DELETED: ${failed.join(", ")} (listed in ${ledgerPath(run)}; the next run's sweep retries after 2 h)`);
  else log(`teardown: ${left.length} deleted`);
}
