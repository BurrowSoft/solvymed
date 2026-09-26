const BODY_LENGTH = 8;

/**
 * Secretary invite codes are "S-" plus 8 letters/digits. Accept them typed
 * with or without the "S-", with spaces, and in any case. Only a real
 * prefix is stripped: an explicit "S-", or a leading S on a 9-character
 * entry (the prefix typed without its hyphen). An 8-character entry is the
 * bare body, so a body that itself starts with S is kept intact. Returns ""
 * when nothing usable is left.
 */
export function normalizeSecretaryCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/\s+/g, "");
  let body: string;
  if (cleaned.startsWith("S-")) {
    body = cleaned.slice(2).replace(/[^A-Z0-9]/g, "");
  } else {
    body = cleaned.replace(/[^A-Z0-9]/g, "");
    if (body.length === BODY_LENGTH + 1 && body.startsWith("S")) body = body.slice(1);
  }
  return body ? `S-${body}` : "";
}

/** A normalized code with the exact invite shape: "S-" plus 8 letters/digits. */
export function isWellFormedSecretaryCode(code: string): boolean {
  return /^S-[A-Z0-9]{8}$/.test(code);
}
