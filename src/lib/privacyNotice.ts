import { PRIVACY_VERSION } from "@/lib/legalVersions";

// "We've updated our Privacy Policy" (cf, 6 Oct; migration 204, mobile #409):
// a dismissible card, once per new version, for anyone whose newest accepted
// privacy version is older than this build's (or never recorded). A notice,
// never a gate. The server's list may run ahead of the text, so the client's
// own PRIVACY_VERSION decides, never the server's newest.

// accepted: the caller's newest stored version (null = none recorded);
// undefined = unknown (no session, 204 not applied yet, an error): no card.
export function privacyNoticeDue(accepted: string | null | undefined, current: string = PRIVACY_VERSION): boolean {
  if (accepted === undefined) return false;
  return accepted === null || accepted < current;
}

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

// The caller's stored version from my_privacy_status(), or undefined when it
// can't be read (fail closed: no card).
export async function readAcceptedPrivacy(db: Rpc): Promise<string | null | undefined> {
  try {
    const { data, error } = await db.rpc("my_privacy_status");
    if (error || data == null) return undefined;
    const row = (Array.isArray(data) ? data[0] : data) as { accepted?: unknown } | undefined;
    if (!row || !("accepted" in row)) return undefined;
    return typeof row.accepted === "string" ? row.accepted : row.accepted === null ? null : undefined;
  } catch {
    return undefined;
  }
}

// The session-only dismissal ("X"), per version.
export const DISMISS_KEY = `sm_privacy_notice_dismissed:${PRIVACY_VERSION}`;
