// Cookie consent (LGPD): "necessary" is always on; analytics and marketing
// are opt-in. The choice is stored in a first-party cookie as
// "<version>.<analytics 0|1><marketing 0|1>.<unix seconds>". It's asked
// again after 12 months, or when CONSENT_VERSION changes (bump it whenever
// the categories or what they cover change, e.g. when ad pixels are added).
// Pure functions, shared by the browser and the server.

export const CONSENT_COOKIE = "sm_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_S = 365 * 24 * 60 * 60;

export type Consent = { analytics: boolean; marketing: boolean };

export function serializeConsent(consent: Consent, nowMs = Date.now()): string {
  const flags = `${consent.analytics ? 1 : 0}${consent.marketing ? 1 : 0}`;
  return `${CONSENT_VERSION}.${flags}.${Math.floor(nowMs / 1000)}`;
}

// Null means "not answered": no cookie, a malformed one, an older consent
// version, or a choice older than 12 months (or from the future).
export function parseConsent(raw: string | null | undefined, nowMs = Date.now()): Consent | null {
  const m = /^(\d{1,4})\.([01])([01])\.(\d{1,12})$/.exec(raw ?? "");
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null;
  const ageS = nowMs / 1000 - Number(m[4]);
  if (ageS < -24 * 60 * 60 || ageS > CONSENT_MAX_AGE_S) return null;
  return { analytics: m[2] === "1", marketing: m[3] === "1" };
}

// Pages that only complete an action from an email link (or hand off to the
// app) get no banner: it would cover the one thing the page is for.
const TRANSACTIONAL = ["/auth/confirm", "/auth/verify", "/auth/reset-password", "/api/"];

export function isTransactionalPath(pathname: string, locales: readonly string[]): boolean {
  const [, first] = pathname.split("/");
  const path = locales.includes(first) ? pathname.slice(first.length + 1) || "/" : pathname;
  return TRANSACTIONAL.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}
