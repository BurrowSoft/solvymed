// One rule for "the network failed" vs "the server said no" (specs/
// offline-guard.md §3, 1.9.0). A weak connection (online, but requests
// fail) must show each place's own generic "couldn't …, try again" with a
// retry, never a refusal message; a genuine refusal keeps its own message.
// The same rule as the app's (c5) and as isAccessLogRefusal (#502).
//
// Two shapes reach a caller:
// - a THROWN error: a server action or fetch that never got an answer
//   (fetch rejects with a TypeError; an abort or timeout with AbortError /
//   TimeoutError; the offline guard's OfflineBlockedError is a TypeError);
// - a RETURNED error from the database: it carries a code (Postgres /
//   PostgREST: 42501, P0001, PGRST…). No code = it never reached the
//   database, i.e. the network.

const NETWORK_MESSAGE = /failed to fetch|fetch failed|networkerror|network request failed|load failed|network error|the internet connection appears to be offline/i;

// A thrown error that means "no answer from the server".
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (e instanceof TypeError) return true;
  return typeof message === "string" && NETWORK_MESSAGE.test(message);
}

// A returned database error that is a real refusal (it has a code).
export function hasServerCode(error: { code?: string | null } | null | undefined): boolean {
  return !!error && typeof error.code === "string" && error.code.trim() !== "";
}

// Runs a server call from the browser and returns `failure` in place of
// anything it throws (no answer from the network, or the server action
// crashing), so the caller's existing error path shows its generic
// "couldn't …, try again", clears its busy state and keeps the form as
// typed, instead of the throw reaching React's error boundary (React 19
// sends a throw inside a transition there: the whole page becomes the
// error screen).
export async function safeCall<T, F>(fn: () => Promise<T>, failure: F): Promise<T | F> {
  try {
    return await fn();
  } catch {
    return failure;
  }
}

// The failure most server actions already return ({ ok: false, code }): a
// throw becomes { ok: false, code: "network" }, which no place maps to a
// message of its own, so each shows its generic "couldn't …, try again".
export const NETWORK_FAILURE = { ok: false, code: "network" } as const;
// The same for actions that return { error } (a string).
export const NETWORK_ERROR = { error: "network" } as const;

// Like safeCall, as { ok, value } / { ok: false, network }.
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; network: boolean }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, network: isNetworkError(e) };
  }
}

// A call that may hang (a stalled upload): after `ms`, `onTimeout` instead.
// The call itself isn't cancelled (the browser can't stop a server action);
// the place shows its failure with a retry instead of waiting forever.
export function timeLimit<T, F>(p: Promise<T>, ms: number, onTimeout: F): Promise<T | F> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}
