// Where a sign-up confirmation link lands: the auth callback, which has no
// [locale] segment, so the language the person signed up in rides along.
// One place for the sign-up and "Resend the confirmation e-mail".
export function signupEmailRedirect(locale: string): string {
  return `https://www.solvymed.com/api/auth/callback?locale=${encodeURIComponent(locale)}`;
}
