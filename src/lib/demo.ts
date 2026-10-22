import { COUNTRY_STEP, type CountryChoice } from "./signupCountry";

// Demo mode ("Explore without an account", specs/demo-mode.md; Vitor's go
// 2026-10-22). A visitor gets an anonymous Supabase session and a sandbox
// practice with fictional data (the mobile dev's migration 234:
// start_demo / is_demo / end_demo), so every dashboard screen works as is.
// Everything is dark until the public switch demo_mode (234, one flip for
// the web and the app); ?demo_test=1 shows it for the tester's window.

export const DEMO_TEST_PARAM = "demo_test";

// The demo's practice country: the path's (as F2: pt-BR → BR, th → TH, from
// COUNTRY_STEP's data), else this explicit default (/en and the other
// languages see the Brazilian demo clinic, in their language).
export const DEMO_DEFAULT_COUNTRY: CountryChoice = "BR";
export function demoCountry(locale: string): CountryChoice {
  return COUNTRY_STEP.find((c) => c.locale === locale)?.code ?? DEMO_DEFAULT_COUNTRY;
}

// A demo session is the only anonymous one SolvyMed creates (the server's
// truth is is_demo(); this is for showing the bar).
export function isDemoUser(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

// ?demo_test=1, the testers' window before the switch: only where the
// server says so (allowed = VERCEL_ENV !== "production"; 01, 10-22), so
// www never opens the demo ahead of demo_mode.
export function demoTestOn(search: string, allowed: boolean): boolean {
  return allowed && new URLSearchParams(search).get(DEMO_TEST_PARAM) === "1";
}

// The tab title's prefix in the demo (Vitor: "it's a DEMO" everywhere).
export const DEMO_TITLE_PREFIX = "[Demo] ";
export function demoTitle(title: string): string {
  return title.startsWith(DEMO_TITLE_PREFIX) ? title : DEMO_TITLE_PREFIX + title;
}

type DemoEnder = {
  rpc: (fn: "end_demo") => PromiseLike<{ error: unknown }>;
  auth: { signOut: () => PromiseLike<unknown> };
};

// Leaving the demo (exit or sign-up): the sandbox goes now (234's end_demo;
// the hourly cleanup catches it otherwise), then the anonymous session.
// Never blocks the visitor: errors are ignored.
export async function leaveDemo(supabase: unknown): Promise<void> {
  const s = supabase as DemoEnder;
  try {
    await s.rpc("end_demo");
  } catch {
    // The hourly cleanup deletes it within 24 h.
  }
  try {
    await s.auth.signOut();
  } catch {
    // Nothing to sign out of.
  }
}
