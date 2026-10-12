// A settings save counts as saved only when the action answered without an
// error: a returned { error } (refused, not signed in, a database error) or
// a throw (no answer: the network, or the action crashing) is a failure.
// Catching the throw also keeps it from React 19's error boundary, which
// would replace the whole page (1.9.0, offline guard §3–4).
export async function savedOk(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = await fn();
    return !(r && typeof r === "object" && "error" in r && (r as { error?: unknown }).error);
  } catch {
    return false;
  }
}
