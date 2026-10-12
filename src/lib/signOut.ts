// Signing out (1.9.0, offline guard): the server sign-out revokes the
// session everywhere; when it can't be reached (offline, a weak network) the
// auth client keeps the local session, so this browser stayed signed in.
// Then this browser's session is removed anyway (its auth cookies deleted
// here, 7e's #512 row), and the revoke waits: the session's tokens are kept for that
// one purpose and the server sign-out is sent as soon as the browser is
// online again, or on the next visit to any page (02: a shared computer
// mustn't leave a valid session behind). Then they're deleted.

type Session = { access_token: string; refresh_token: string } | null;
type Auth = {
  signOut(opts?: { scope?: "global" | "local" | "others" }): Promise<{ error: unknown }>;
  getSession?(): Promise<{ data: { session: Session } }>;
  stopAutoRefresh?(): Promise<void> | void;
};

export const PENDING_KEY = "solvymed.pendingSignOut";

function store(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export async function signOutHere(auth: Auth): Promise<void> {
  let session: Session = null;
  try { session = (await auth.getSession?.())?.data.session ?? null; } catch { /* none */ }
  let failed = false;
  try {
    failed = !!(await auth.signOut()).error;
  } catch {
    failed = true;
  }
  if (!failed) return;
  if (session) {
    try { store()?.setItem(PENDING_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })); } catch { /* storage off: nothing to keep */ }
    if (typeof window !== "undefined") window.addEventListener("online", () => { void flushPendingSignOut(); }, { once: true });
  }
  // No ticker writing a refreshed session back once online again.
  try { await auth.stopAutoRefresh?.(); } catch { /* ignore */ }
  // auth-js's "local" sign-out still calls the server first and, when that
  // fails, keeps the session (7e: the cookie stayed, and the first page
  // online rendered the dashboard signed in). The session lives in this
  // browser's own cookies (@supabase/ssr, not httpOnly): delete them here,
  // whatever the network does.
  try { await auth.signOut({ scope: "local" }); } catch { /* offline */ }
  clearAuthCookies();
}

// The auth cookies of @supabase/ssr: sb-<project>-auth-token, its chunks
// (.0, .1, …) and the PKCE code verifier. Expired on the path they're set
// on ("/"), plus any copy left in localStorage.
export function clearAuthCookies(): void {
  if (typeof document === "undefined") return;
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && /^sb-.+-auth-token/.test(name)) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
  const s = store();
  try {
    for (const k of Object.keys(s ?? {})) if (/^sb-.+-auth-token/.test(k)) s?.removeItem(k);
  } catch { /* storage off */ }
}

// Sends the waiting server sign-out, if any. The access token may have
// expired meanwhile: then a refresh first (its own refresh token), and the
// sign-out with the new one. Done (or refused for good: the session is
// already gone) → forgotten. A network failure keeps it for the next try.
export async function flushPendingSignOut(
  base = process.env.NEXT_PUBLIC_SUPABASE_URL,
  apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
): Promise<"none" | "done" | "later"> {
  const s = store();
  let raw: string | null = null;
  try { raw = s?.getItem(PENDING_KEY) ?? null; } catch { return "none"; }
  if (!raw || !base || !apikey) return "none";
  const forget = () => { try { s?.removeItem(PENDING_KEY); } catch { /* ignore */ } };
  let pending: { access_token?: string; refresh_token?: string };
  try { pending = JSON.parse(raw); } catch { forget(); return "done"; }
  try {
    // scope=local: exactly the abandoned session. Without it the sign-out is
    // global, and running later it would also end sessions made after the
    // click (the doctor's phone, a new sign-in here; ec).
    const logout = (token: string) => fetchImpl(`${base}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey, Authorization: `Bearer ${token}` } });
    let res = pending.access_token ? await logout(pending.access_token) : null;
    if (!res || res.status === 401 || res.status === 403) {
      if (!pending.refresh_token) { forget(); return "done"; }
      const r = await fetchImpl(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: pending.refresh_token }),
      });
      // The refresh token no longer works: the session is already gone.
      if (!r.ok) { forget(); return "done"; }
      const fresh = (await r.json()) as { access_token?: string };
      if (!fresh.access_token) { forget(); return "done"; }
      res = await logout(fresh.access_token);
    }
    if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) { forget(); return "done"; }
    return "later";
  } catch {
    return "later";
  }
}
