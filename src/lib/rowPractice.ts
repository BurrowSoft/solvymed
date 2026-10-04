import { AsyncLocalStorage } from "node:async_hooks";

// 166 "All" schedule: a secretary acts on a row of ANY doctor she serves.
// The row's doctor is the acting practice for that one server action only
// (c6 B3: the x-acting-practice header PER CALL, never page-level): the
// action runs inside inRowPractice, and createClient() / actingPracticeFor()
// read it from here instead of the switcher's cookie. The id must be one of
// her practices (actingPracticeFor re-checks against get_my_practices), and
// the database re-checks it again (163: a doctor she doesn't serve → no
// practice).
const store = new AsyncLocalStorage<string>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rowPracticeOverride(): string | undefined {
  return store.getStore();
}

export function inRowPractice<T>(practiceId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  if (!practiceId || !UUID.test(practiceId)) return fn();
  return store.run(practiceId, fn);
}
