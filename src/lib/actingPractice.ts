// Which doctor a secretary serving several doctors is acting for (1.5.0,
// migration 163; behind liveFeatures.multiPractice). The choice is a cookie
// set by the switcher; every Supabase request then carries it as the
// x-acting-practice header, which the server honours only for a doctor she
// serves (a stale one acts for NO practice), so the switcher only ever sets
// an id from get_my_practices() and the dashboard clears a stale one.
import { liveFeatures } from "./liveFeatures";

export const ACTING_COOKIE = "sm_practice";
// The switcher's "Todos" (166): the Agenda shows every doctor she serves.
// Not an id, so it never becomes a header; every other page acts for her
// primary doctor.
export const ALL_PRACTICES = "all";
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
  const read = (name: string) => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const value = read(ACTING_COOKIE);
  // "Todos" with a lapsed primary: the first active doctor, as on the server.
  return value === ALL_PRACTICES ? read(ALL_FALLBACK_COOKIE) : value;
}

// Set by the switcher (an id from get_my_practices) or cleared (null).
export function setBrowserActingCookie(id: string | null) {
  document.cookie = id
    ? `${ACTING_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
    : `${ACTING_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

// title: migration 166 (absent before it). subscription_active: migration 182
// (absent before it, which counts as active: nothing is hidden on a guess).
export type MyPractice = { professional_id: string; display_name: string | null; title?: string | null; accent_color: string | null; is_primary: boolean; subscription_active?: boolean | null };

// A doctor whose subscription has lapsed: she can't work for them until they renew.
export function isLapsed(p: Pick<MyPractice, "subscription_active">): boolean {
  return p.subscription_active === false;
}

// "Todos" acts for her primary doctor outside the Agenda; when that doctor's
// subscription lapsed, for her first active doctor instead (null: primary).
export function allFallbackId(list: Pick<MyPractice, "professional_id" | "is_primary" | "subscription_active">[]): string | null {
  const primary = list.find((p) => p.is_primary);
  if (!primary || !isLapsed(primary)) return null;
  return list.find((p) => !isLapsed(p))?.professional_id ?? null;
}

// The browser's copy of that fallback (the dashboard writes it before any
// script runs), so the browser client acts for the same doctor as the server.
export const ALL_FALLBACK_COOKIE = "sm_practice_fb";
export function allFallbackCookieScript(id: string | null): string {
  return id && UUID.test(id)
    ? `document.cookie="${ALL_FALLBACK_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax"`
    : `document.cookie="${ALL_FALLBACK_COOKIE}=; path=/; max-age=0; samesite=lax"`;
}

// "Todos": the doctors shown (lapsed ones left out) and how many were left out.
export function todosPractices<T extends Pick<MyPractice, "subscription_active">>(practices: T[]): { shown: T[]; lapsedCount: number } {
  const shown = practices.filter((p) => !isLapsed(p));
  return { shown, lapsedCount: practices.length - shown.length };
}

// Set when she picks a doctor herself (the switcher, "Trocar de médico"), so
// the inactive screen doesn't move her off a lapsed doctor she chose on purpose.
export const PICKED_KEY = "sm_practice_picked";
