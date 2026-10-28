// The stop link at the end of every automatic WhatsApp message to a patient
// (specs/whatsapp-optout-contract.md v2; privacy PC-W1′). The message links to
// /{locale}/whatsapp/stop?t=<token>; the page shows a button, and only its POST
// (/api/whatsapp/stop → the whatsapp-optout edge function) records the opt-out,
// so a link preview or a scanner opening the link changes nothing.

// The token is AES-256-GCM over {practice, number}: key id (1) + IV (12) +
// "uuid|digits" (45–52) + tag (16) bytes, base64url without padding, so 99–108
// characters today (the mobile developer, 10-28). Only the edge function can read
// it; this is a cheap shape check before the POST, kept a little looser than
// today's format so a later key or format version isn't refused here.
const TOKEN = /^[A-Za-z0-9_-]{80,200}$/;

export function isWellFormedStopToken(t: unknown): t is string {
  return typeof t === "string" && TOKEN.test(t);
}

export function optoutEndpoint(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-optout`;
}

// A per-IP limit on the POST (best effort, per server instance), as
// /api/notices/unsubscribe. The edge function keeps its own per-token limit.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

export function allowStop(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((at) => now - at < WINDOW_MS)) hits.delete(key);
  }
  return true;
}

// Tests only.
export function resetStopLimit() {
  hits.clear();
}
