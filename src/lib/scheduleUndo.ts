// The Agenda's Desfazer (UX 2026-09-30; the app's lib/appointment-undo.ts):
// after a manual book, move or cancel, a 10 s toast offers to undo it,
// unless a push already went out from here ('direct'). What the undo needs
// travels back to the server, which re-checks everything before touching
// anything (undoScheduleChange).

export type UndoKind = "booked" | "moved" | "cancelled";

export type UndoToken = {
  kind: UndoKind;
  ids: string[];
  // The queued notice (135) to drop first, or null when nobody was told.
  told: number | null;
  // As the action left it: every date (a series), the start, the status.
  dates: string[];
  start: string;
  status: string;
  // What to put back: a move's old slot, a cancel's old status.
  prevDate?: string;
  prevStart?: string;
  prevEnd?: string;
  prevStatus?: string;
  // Issued at (ms) and the server's signature over all of it + the practice
  // (lib/scheduleUndoSign): the token is only ever honoured as issued.
  iat: number;
  sig: string;
};

export const UNDO_EVENT = "solvymed:schedule-undo";

// A form or select offers the undo; the Schedule's toast shows it.
export function offerUndo(token: UndoToken | null | undefined) {
  if (!token || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<UndoToken>(UNDO_EVENT, { detail: token }));
}
