// The demo's bot check (01 + 0e, 10-22): Cloudflare Turnstile before
// start_demo. Its own keys, apart from the dormant sign-up Turnstile
// (NEXT_PUBLIC_TURNSTILE_SITE_KEY would wake the sign-up / sign-in widgets
// and the privacy row that names them). Read on the server only.
// Production: DEMO_TURNSTILE_SITE_KEY + DEMO_TURNSTILE_SECRET_KEY (set in
// Vercel by Vitor). Everywhere else: Cloudflare's published always-pass test
// keys, so previews and the testers' window never need a real secret.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

// test: the always-pass keys, whose answers carry no real action or hostname.
export function demoTurnstileKeys(): { siteKey: string; secret: string; test: boolean } {
  if (process.env.VERCEL_ENV === "production") {
    return { siteKey: process.env.DEMO_TURNSTILE_SITE_KEY ?? "", secret: process.env.DEMO_TURNSTILE_SECRET_KEY ?? "", test: false };
  }
  return { siteKey: TEST_SITE_KEY, secret: TEST_SECRET, test: true };
}

// With the real keys, a token counts only if it was made by /demo's widget
// (its action) on our own site (cf): never one from another widget or site.
export function demoTurnstileAnswerOk(answer: { success?: boolean; action?: string; hostname?: string }, test: boolean): boolean {
  if (answer.success !== true) return false;
  if (test) return true;
  const host = answer.hostname ?? "";
  return answer.action === DEMO_TURNSTILE_ACTION && (host === "solvymed.com" || host.endsWith(".solvymed.com"));
}

export const DEMO_TURNSTILE_ACTION = "demo";
