// Signing out (1.9.0, offline guard): the server sign-out revokes the
// session everywhere; when it can't be reached (offline, a weak network) the
// auth client keeps the local session, so this browser stayed signed in.
// Then this browser's session is removed anyway (scope "local", no request):
// the device is signed out, and the server's session simply expires.
type Auth = { signOut(opts?: { scope?: "global" | "local" | "others" }): Promise<{ error: unknown }> };

export async function signOutHere(auth: Auth): Promise<void> {
  let failed = false;
  try {
    failed = !!(await auth.signOut()).error;
  } catch {
    failed = true;
  }
  if (failed) await auth.signOut({ scope: "local" });
}
