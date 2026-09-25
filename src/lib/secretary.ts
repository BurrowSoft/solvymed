/**
 * Secretary invite codes look like "S-XXXXXXXX". Accept them typed with or
 * without the "S-", with spaces, and in any case. Returns "" when nothing
 * usable is left.
 */
export function normalizeSecretaryCode(raw: string): string {
  const body = raw.toUpperCase().replace(/\s+/g, "").replace(/^S-?/, "").replace(/[^A-Z0-9]/g, "");
  return body ? `S-${body}` : "";
}
