// Patient Channel notice e-mails: the "stop these e-mails" link (247, 01's
// approved strings, 10-27). The e-mail's footer links to
// /{locale}/notices/unsubscribe?t=<token>; the page shows a button, and only
// its POST (/api/notices/unsubscribe) calls pc_email_optout_confirm, so a mail
// scanner prefetching the link never unsubscribes anyone.

// 32 random bytes, base64url without padding (the mobile developer's contract).
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(t: unknown): t is string {
  return typeof t === "string" && TOKEN.test(t);
}

// A per-IP limit on the POST. The token is 256 random bits, so this isn't
// about guessing: it only stops one address from hammering the RPC. Kept in
// this server instance's memory (best effort; each instance counts on its own).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

export function allowUnsubscribe(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map small: drop addresses with nothing recent.
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((at) => now - at < WINDOW_MS)) hits.delete(key);
  }
  return true;
}

// Tests only.
export function resetUnsubscribeLimit() {
  hits.clear();
}
