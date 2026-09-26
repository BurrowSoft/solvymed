import type { Breadcrumb } from "@sentry/nextjs";
import { redactAnalyticsUrl } from "./analyticsRedact";

// The parts of a Sentry error or transaction event the scrubber touches,
// declared structurally so it works for both event kinds.
type ScrubbableEvent = {
  request?: { url?: string; method?: string; [key: string]: unknown };
  user?: { id?: string | number; [key: string]: unknown };
  extra?: unknown;
  message?: string;
  exception?: { values?: { value?: string; stacktrace?: { frames?: StackFrame[] } }[] };
  transaction?: string;
  breadcrumbs?: Breadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  tags?: Record<string, unknown>;
  logentry?: { message?: string; params?: unknown[]; [key: string]: unknown };
  spans?: unknown[];
};

type StackFrame = {
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  vars?: unknown;
  [key: string]: unknown;
};

// Contexts kept as they are: environment facts only. Everything else is
// dropped, e.g. "nextjs" (request_path carries the raw query string).
const SAFE_CONTEXTS = ["os", "runtime", "browser", "device", "app", "culture", "cloud_resource"];
// The trace context keeps its ids and status; its data can hold URLs.
const SAFE_TRACE_KEYS = ["trace_id", "span_id", "parent_span_id", "op", "status", "origin"];

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
  // Path only: no query string at all (search terms, emails, invite data).
  const pathOnly = redacted.split("?")[0];
  return absolute ? pathOnly : pathOnly.replace("https://x.invalid", "");
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
    // Source lines around each frame, and local variables if ever enabled.
    for (const frame of ex.stacktrace?.frames ?? []) {
      if (frame.context_line) frame.context_line = scrubText(frame.context_line);
      if (frame.pre_context) frame.pre_context = frame.pre_context.map(scrubText);
      if (frame.post_context) frame.post_context = frame.post_context.map(scrubText);
      delete frame.vars;
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction) ?? event.transaction;
  if (event.contexts) {
    const contexts: NonNullable<ScrubbableEvent["contexts"]> = {};
    for (const key of SAFE_CONTEXTS) {
      if (event.contexts[key]) contexts[key] = event.contexts[key];
    }
    const trace = event.contexts.trace;
    if (trace) {
      contexts.trace = {};
      for (const key of SAFE_TRACE_KEYS) {
        if (trace[key] !== undefined) contexts.trace[key] = trace[key];
      }
    }
    event.contexts = contexts;
  }
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value !== "string") continue;
      event.tags[key] = /^(https?:\/\/|\/)/.test(value) ? (scrubUrl(value) ?? "[url]") : scrubText(value);
    }
  }
  if (event.logentry) {
    event.logentry = { message: event.logentry.message ? scrubText(event.logentry.message) : undefined };
  }
  // Spans (transactions) carry full URLs, including Supabase REST filters
  // with patient names. Tracing is off, and any span that still arrives is
  // dropped.
  delete event.spans;
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
