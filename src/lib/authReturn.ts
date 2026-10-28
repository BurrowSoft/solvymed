import { routing } from "@/i18n/routing";

// Back to the Patient Channel page a notice linked to, after signing in (WT1's TH
// rehearsal, 01 10-28): the reply e-mail's link opened while signed out used to land on
// the sign-in page and then on the usual home, not on the reply. Only two exact shapes
// are honored, never an arbitrary URL, so ?next= can't become an open redirect:
// - a patient's channel page (pc-notify's link to the patient);
// - a staff member's request page (pc-notify's link to the practice).
// Each one only where that account would have gone anyway (a patient's home, a staff
// member's dashboard), so a doctor never lands on a patient page or a paywall is skipped.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LOCALE = `(?:/(?:${routing.locales.join("|")}))?`;
const PATIENT = new RegExp(`^${LOCALE}/my-appointments/channel/${UUID}$`);
const STAFF = new RegExp(`^${LOCALE}/dashboard/patient-channel/${UUID}$`);

// The cookie that carries a checked ?next= through Google's round trip (the callback
// can't read the sign-in page's URL). Short-lived; the callback always clears it.
export const RETURN_COOKIE = "sm_auth_return";

export function returnPath(next: string | null | undefined): string | null {
  return typeof next === "string" && (PATIENT.test(next) || STAFF.test(next)) ? next : null;
}

// The cookie's value as a return page, or null (a malformed value never throws).
export function returnFromCookie(raw: string | null | undefined): string | null {
  try {
    return returnPath(decodeURIComponent(raw ?? ""));
  } catch {
    return null;
  }
}

// Where to go after signing in: the return page when it fits the place the account was
// going anyway, else that place.
export function withReturn(dest: string, next: string | null | undefined): string {
  const path = returnPath(next);
  if (!path) return dest;
  const home = dest.split("?")[0];
  if (PATIENT.test(path) && home.endsWith("/my-appointments")) return path;
  if (STAFF.test(path) && home.endsWith("/dashboard")) return path;
  return dest;
}

// The sign-in page's address for a signed-out visitor of a return page.
export function loginWithReturn(prefix: string, path: string): string {
  return returnPath(path) ? `${prefix}/auth/login?next=${encodeURIComponent(path)}` : `${prefix}/auth/login`;
}
