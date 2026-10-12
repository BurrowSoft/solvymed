// A device clock that's wrong (1.9.0 item 1.7, app + web): the sign-in
// tokens' expiry comes from the server, but the browser compares it with
// its own clock, so a clock an hour or more fast makes every new token look
// expired and the auth client refreshes it again and again (measured: 24
// refreshes in 5 minutes with a clock 2 h fast, none when right), which can
// end in rate limits and a sign-out. The website asks the server for its
// time, and while the device is more than 5 minutes off it stops the
// background refresh and says so; when the clock is right again, both undo.

export const SKEW_LIMIT_MS = 5 * 60_000;

// The device's offset from the server, from one round trip: the server's
// time against the middle of the request (half the trip each way).
export function skewMs(sentAt: number, receivedAt: number, serverNow: number): number {
  return (sentAt + receivedAt) / 2 - serverNow;
}

export function isSkewed(skew: number): boolean {
  return Math.abs(skew) > SKEW_LIMIT_MS;
}

// Asks /api/time; null when the check itself fails (then the clock is
// assumed right: never block on a failed check).
export async function measureSkew(fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<number | null> {
  try {
    const sentAt = now();
    const res = await fetchImpl("/api/time", { cache: "no-store" });
    const receivedAt = now();
    if (!res.ok) return null;
    const body = (await res.json()) as { now?: unknown };
    return typeof body.now === "number" ? skewMs(sentAt, receivedAt, body.now) : null;
  } catch {
    return null;
  }
}

// The device's measured offset (set by ClockSkewGuard), in ms; 0 = unknown
// or right.
let knownSkew = 0;
export function setKnownSkew(ms: number | null): void {
  knownSkew = ms !== null && isSkewed(ms) ? ms : 0;
}

// The auth client compares a token's expiry (server time) with the device's
// clock on EVERY request, not only in its background refresh, so a skewed
// device refreshed once per request (ec, #521). This fetch, given to the
// browser client, shifts the expiry of each token the auth server issues by
// the measured offset, so the comparison is right on the device's own
// clock: the token is refreshed when it really expires, no sooner.
export function skewAwareFetch(base?: typeof fetch): typeof fetch {
  return async (input, init) => {
    // The page's fetch at call time, so the offline guard's wrapper applies.
    const res = await (base ?? globalThis.fetch)(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!knownSkew || !res.ok || !url.includes("/auth/v1/token")) return res;
    try {
      const body = (await res.clone().json()) as { expires_at?: unknown };
      if (typeof body.expires_at !== "number") return res;
      const shifted = { ...body, expires_at: body.expires_at + Math.round(knownSkew / 1000) };
      return new Response(JSON.stringify(shifted), { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch {
      return res;
    }
  };
}
