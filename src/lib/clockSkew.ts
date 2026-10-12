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
