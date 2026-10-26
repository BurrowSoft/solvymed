import { parseCountryChoice, type CountryChoice } from "./signupCountry";

// Sign in with Google (specs/google-sign-in.md; migration 232). The button
// shows only while the public switch google_signin is on (one flip for the
// web and the app, publicFlags). Google returns to our own callback, which
// carries what the sign-up page already knew: its language, the practice
// country (only one the page had: ?c=, the visitor's own path, or the step;
// never one from a language the site picked, F2) and the role card. These
// are plain query parameters on an allow-listed URL: no new cookie, nothing
// stored (b9 #4). Scopes: openid, email, profile only; we keep the name and
// e-mail, never the photo (01).

export type GoogleRole = "professional" | "patient";
export type GoogleSource = "signup" | "login";

export const GOOGLE_SCOPES = "openid email profile";
// The callback's marker that this round trip started at our Google button,
// so the landing page can report signup_google_return.
export const GOOGLE_RETURN_PARAM = "gr";
// Shows the button while the switch is off, for the tester's window (01).
export const GOOGLE_TEST_PARAM = "google_test";

export function parseGoogleRole(raw: string | null | undefined): GoogleRole | null {
  return raw === "professional" || raw === "patient" ? raw : null;
}

export function googleRedirectTo(
  origin: string,
  s: { locale: string; country?: CountryChoice | null; role?: GoogleRole | null; source: GoogleSource; via?: "demo" },
): string {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("locale", s.locale);
  url.searchParams.set("google", s.source);
  const c = parseCountryChoice(s.country ?? null);
  if (c) url.searchParams.set("c", c);
  const role = parseGoogleRole(s.role ?? null);
  if (role) url.searchParams.set("role", role);
  // From the demo's sign-up (238's signup_from_demo, counted by the callback for a
  // NEW account; nothing stored).
  if (s.via === "demo") url.searchParams.set("via", "demo");
  return url.toString();
}

type OAuthClient = {
  auth: {
    signInWithOAuth: (args: {
      provider: "google";
      options: { redirectTo: string; scopes: string; queryParams: Record<string, string> };
    }) => PromiseLike<{ error: unknown }>;
  };
};

// Leaves the page for Google (a full navigation); resolves only on an error.
export async function startGoogleSignIn(supabase: unknown, redirectTo: string): Promise<{ error: unknown }> {
  const { error } = await (supabase as OAuthClient).auth.signInWithOAuth({
    provider: "google",
    // select_account: a shared computer never signs into the last Google account silently.
    options: { redirectTo, scopes: GOOGLE_SCOPES, queryParams: { prompt: "select_account" } },
  });
  return { error };
}

// signup_onboarding_is_pending() (232), FAIL SAFE: only an explicit true is
// "pending"; an error, a missing function (232 not live), a network failure
// or anything else is "not pending", so routing stays exactly as before.
type PendingReader = { rpc: (fn: "signup_onboarding_is_pending") => PromiseLike<{ data: unknown; error: unknown }> };
export async function onboardingPending(supabase: unknown): Promise<boolean> {
  try {
    const { data, error } = await (supabase as PendingReader).rpc("signup_onboarding_is_pending");
    return !error && data === true;
  } catch {
    return false;
  }
}
