// The signed-in user for a server request, refreshing once if the access
// token turns out to be expired (1.9.0, ec on #521). A device whose clock
// is off stores a token expiry shifted to its own clock (lib/clockSkew), and
// the server's auth client trusts that expiry: it may skip its usual refresh
// and send an already expired token, which getUser refuses. Then: one
// refreshSession (with the refresh token in the cookies) and one retry,
// instead of treating the doctor as signed out. Nothing else changes: no
// session, or a refresh that fails, is still "no user".

type AuthLike = {
  getUser(): Promise<{ data: { user: unknown }; error: { name?: string; message?: string; status?: number; code?: string } | null }>;
  refreshSession(): Promise<{ error: unknown }>;
};

export async function userWithRefresh<U>(auth: AuthLike): Promise<U | null> {
  const first = await auth.getUser();
  if (first.data.user) return first.data.user as U;
  // No session at all: nothing to refresh.
  if (!first.error || first.error.name === "AuthSessionMissingError") return null;
  const refreshed = await auth.refreshSession();
  if (refreshed.error) return null;
  const second = await auth.getUser();
  return (second.data.user as U) ?? null;
}
