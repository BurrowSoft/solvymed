// Whether this sign-in is the email confirmation itself, so a new
// professional sees /auth/professional-welcome once (first-run spec §1)
// and every later login goes straight to the dashboard. The link's `type`
// can't tell (confirmation links arrive as signup, email or magiclink), but
// Supabase stamps confirmed_at at the moment of confirming: a fresh stamp
// means this link is the one that confirmed the account.

const FIRST_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;

export function isFirstConfirmation(
  user: { confirmed_at?: string | null; email_confirmed_at?: string | null },
  linkType: string | null | undefined,
  now: number = Date.now(),
): boolean {
  // A password reset is never the welcome moment, even right after signup.
  if (linkType === "recovery") return false;
  const stamp = user.email_confirmed_at ?? user.confirmed_at;
  if (!stamp) return false;
  const age = now - new Date(stamp).getTime();
  return age >= -60_000 && age <= FIRST_CONFIRMATION_WINDOW_MS;
}
