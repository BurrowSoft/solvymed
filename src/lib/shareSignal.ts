import * as Sentry from "@sentry/nextjs";

// Evidence for F1 (fa's #528 row: a new document saved with "Share with the
// patient" ticked was sometimes never shared; the cause wasn't proven).
// When a save is about to lose a share, or was saved by the form-id
// fallback (#536), one warning goes to error monitoring. Only the reason,
// the dialog's mode and two yes/no flags: no ids, no document type, no
// text (privacy §4/§5; sentryScrub keeps the user to the internal id).
// At most once per dialog (`onceKey`), so a stuck loop can't flood it.

export type ShareSignalReason = "id_fallback" | "choice_mismatch";

const sent = new Set<string>();

export function signalShareCheck(reason: ShareSignalReason, mode: "new" | "edit" | "correct", flags: { wantShare: boolean; hasId: boolean }, onceKey: string): void {
  const key = `${onceKey}:${reason}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    Sentry.captureMessage("document_share_check", {
      level: "warning",
      tags: { reason, mode, wantShare: flags.wantShare ? "yes" : "no", hasId: flags.hasId ? "yes" : "no" },
    });
  } catch {
    /* monitoring never affects the page */
  }
}
