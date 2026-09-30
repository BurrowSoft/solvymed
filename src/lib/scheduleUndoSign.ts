import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { UndoToken } from "./scheduleUndo";

// The Agenda's Desfazer token travels through the browser, so it's signed
// here (9a on #180): an HMAC over every field, the practice it belongs to
// and when it was issued. undoScheduleChange accepts only an untampered
// token of the caller's own practice, issued less than UNDO_TTL_MS ago
// (the toast lasts 10 s). The key is derived from the server's own secret
// for this one purpose; without it no token is issued (no Desfazer), never
// an unsigned one.

export const UNDO_TTL_MS = 2 * 60 * 1000;

function key(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHmac("sha256", secret).update("solvymed:schedule-undo:v1").digest() : null;
}

type Unsigned = Omit<UndoToken, "iat" | "sig">;

// A fixed field order, so the same token always signs the same way.
function payload(t: Unsigned, iat: number, practiceId: string): string {
  return JSON.stringify([
    t.kind, t.ids, t.told, t.dates, t.start, t.status,
    t.prevDate ?? null, t.prevStart ?? null, t.prevEnd ?? null, t.prevStatus ?? null,
    iat, practiceId,
  ]);
}

export function signUndo(t: Unsigned, practiceId: string, now = Date.now()): UndoToken | null {
  const k = key();
  if (!k) return null;
  const sig = createHmac("sha256", k).update(payload(t, now, practiceId)).digest("base64url");
  return { ...t, iat: now, sig };
}

export function verifyUndo(t: UndoToken, practiceId: string, now = Date.now()): boolean {
  const k = key();
  if (!k || typeof t.sig !== "string" || typeof t.iat !== "number" || !Number.isFinite(t.iat)) return false;
  if (now - t.iat > UNDO_TTL_MS || t.iat - now > 5_000) return false;
  const expected = Buffer.from(createHmac("sha256", k).update(payload(t, t.iat, practiceId)).digest("base64url"));
  const given = Buffer.from(t.sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
