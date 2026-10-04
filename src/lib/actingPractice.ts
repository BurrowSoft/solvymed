// Which doctor a secretary serving several doctors is acting for (1.5.0,
// migration 163; behind liveFeatures.multiPractice). The choice is a cookie
// set by the switcher; every Supabase request then carries it as the
// x-acting-practice header, which the server honours only for a doctor she
// serves (a stale one acts for NO practice), so the switcher only ever sets
// an id from get_my_practices() and the dashboard clears a stale one.
import { liveFeatures } from "./liveFeatures";

export const ACTING_COOKIE = "sm_practice";
export const ACTING_HEADER = "x-acting-practice";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The header for a cookie value, when the feature is on and it's well formed.
export function actingHeaders(cookieValue: string | null | undefined): Record<string, string> {
  if (!liveFeatures.multiPractice || !cookieValue || !UUID.test(cookieValue)) return {};
  return { [ACTING_HEADER]: cookieValue };
}

// The cookie value in the browser (null on the server or when unset).
export function browserActingCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ACTING_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// Set by the switcher (an id from get_my_practices) or cleared (null).
export function setBrowserActingCookie(id: string | null) {
  document.cookie = id
    ? `${ACTING_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
    : `${ACTING_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

// title: migration 166 (absent before it).
export type MyPractice = { professional_id: string; display_name: string | null; title?: string | null; accent_color: string | null; is_primary: boolean };
