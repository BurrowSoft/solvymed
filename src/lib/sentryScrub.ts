import type { Breadcrumb } from "@sentry/nextjs";
import { redactAnalyticsUrl } from "./analyticsRedact";

// The parts of a Sentry error or transaction event the scrubber touches,
// declared structurally so it works for both event kinds.
type ScrubbableEvent = {
  request?: { url?: string; method?: string; [key: string]: unknown };
  user?: { id?: string | number; [key: string]: unknown };
  extra?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
  transaction?: string;
  breadcrumbs?: Breadcrumb[];
};

// Strict PII scrubbing for Sentry (the org is US-hosted, so this is the real
// safeguard). Errors keep what's needed to debug them (stack, route,
// browser/OS, release, the internal user id) and lose anything that can
// carry patient or personal data: request bodies, headers, cookies, query
// values, URL fragments, console output, and emails/CPFs/phone numbers in
// free text.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// CPF with or without punctuation (000.000.000-00 / 00000000000).
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// Phone-like runs: 8+ digits, optionally with +, spaces, dots, dashes, parens.
const PHONE = /\+?\(?\d[\d\s().-]{7,}\d/g;

export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(CPF, "[cpf]").replace(PHONE, "[phone]");
}

function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  // Relative URLs (breadcrumbs often have them) get a dummy origin.
  const absolute = /^https?:\/\//.test(url);
  const redacted = redactAnalyticsUrl(absolute ? url : `https://x.invalid${url.startsWith("/") ? "" : "/"}${url}`);
  if (!redacted) return undefined;
  return absolute ? redacted : redacted.replace("https://x.invalid", "");
}

// Returns the same (mutated) event object, typed as passed in, so it fits
// Sentry's beforeSend and beforeSendTransaction alike.
export function scrubEvent<T extends object>(input: T): T {
  const event = input as ScrubbableEvent;
  if (event.request) {
    event.request = { url: scrubUrl(event.request.url), method: event.request.method };
  }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : {};
  delete event.extra;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction) ?? event.transaction;
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map((b) => scrubBreadcrumb(b))
    .filter((b): b is Breadcrumb => b !== null);
  return input;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Console output can contain anything (patient names, form values).
  if (crumb.category === "console") return null;
  const out: Breadcrumb = { ...crumb };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const key of ["url", "from", "to"]) {
      if (typeof out.data[key] === "string") data[key] = scrubUrl(out.data[key] as string);
    }
    for (const key of ["method", "status_code"]) {
      if (out.data[key] !== undefined) data[key] = out.data[key];
    }
    out.data = data;
  }
  return out;
}
