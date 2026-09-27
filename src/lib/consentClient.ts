"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_S, parseConsent, serializeConsent, type Consent } from "./consent";
import { ATTRIBUTION_COOKIE } from "./attribution";

// Browser side of the consent cookie: read it, save a choice, and let
// components re-render when it changes. "Cookie settings" links reopen the
// banner through OPEN_EVENT.

export const OPEN_EVENT = "solvymed:cookie-settings";
export const ANON_ID_KEY = "sm_anon_id";

const listeners = new Set<() => void>();

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export function writeCookie(name: string, value: string, maxAgeS: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Max-Age=${maxAgeS}; Path=/; SameSite=Lax${secure}`;
}

export function currentConsent(): Consent | null {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

export function saveConsent(consent: Consent) {
  const before = currentConsent();
  writeCookie(CONSENT_COOKIE, serializeConsent(consent), CONSENT_MAX_AGE_S);
  // Withdrawn categories: delete what they stored.
  if (!consent.marketing) writeCookie(ATTRIBUTION_COOKIE, "", 0);
  if (!consent.analytics) {
    try {
      localStorage.removeItem(ANON_ID_KEY);
    } catch {
      // Storage blocked: nothing was stored either.
    }
  }
  listeners.forEach((l) => l());
  // An analytics script that already loaded can't be unloaded; a reload
  // starts the page without it.
  if (before?.analytics && !consent.analytics) location.reload();
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The raw cookie is the snapshot (a stable string); on the server it's
// undefined, so nothing consent-dependent renders before hydration.
const getSnapshot = () => readCookie(CONSENT_COOKIE) ?? "";
const getServerSnapshot = () => undefined;

// { ready: false } during server rendering and hydration; then the parsed
// choice, or null when the visitor hasn't answered.
export function useConsent(): { ready: boolean; consent: Consent | null } {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return raw === undefined ? { ready: false, consent: null } : { ready: true, consent: parseConsent(raw) };
}
