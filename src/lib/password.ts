// Must match the Supabase Auth "minimum password length" setting (and the
// mobile app). Checked client-side so the user gets a translated message
// before the request; the server's weak_password error maps to the same one.
export const MIN_PASSWORD_LENGTH = 8;

export function isWeakPasswordError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "weak_password";
}
