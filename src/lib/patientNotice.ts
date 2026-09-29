import type { SupabaseClient } from "@supabase/supabase-js";

// The patient notice outbox (migration 135; the app's lib/patient-notice.ts):
// what the clinic did to a patient's appointment is queued on the server and
// pushed ~60 s later, so an undo can drop it first. The server derives who to
// tell and how the clinic is named from the appointment ids.
//
// Until 135 is applied and its sender is live ('outbox_not_live'), the caller
// sends directly as before. Only a missing function is remembered (an older
// database: direct for this server instance); 'outbox_not_live' and any other
// error are asked again next time. A lost response once the outbox is known
// to work is retried once (the server returns the same pending notice), so a
// committed insert isn't followed by a direct push too (the app's rule).

export type NoticeKind = "booked" | "moved" | "cancelled";

/** The outbox can't take it: send directly. */
export class NoticeOutboxUnavailable extends Error {}

let missing = false;
let live = false;
/** Test hook. */
export function resetNoticeOutboxProbe() { missing = false; live = false; }

const missingRpc = (e: { code?: string; message?: string }) =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? "");

/**
 * Queues a notice: its id (for an undo), or null when nobody is to be told
 * (no app account, blocked time, the past, or a pending notice already
 * covers it). A series is one call with all its ids; 'moved' is one id plus
 * the slot it came from. Throws NoticeOutboxUnavailable to send directly.
 */
export async function enqueuePatientNotice(
  db: SupabaseClient, kind: NoticeKind, appointmentIds: string[], from?: { date: string; startTime: string },
): Promise<number | null> {
  if (missing) throw new NoticeOutboxUnavailable("unsupported");
  type Res = { data: unknown; error: { code?: string; message?: string } | null };
  const call = async (): Promise<Res> => db.rpc("enqueue_patient_notice", {
    p_kind: kind, p_appointment_ids: appointmentIds,
    p_from_date: from?.date ?? null, p_from_time: from ? from.startTime.slice(0, 5) : null,
  }) as unknown as Res;
  // A lost response (a throw, or an error with no code) when the outbox is
  // known to work: once more before giving up.
  const lost = (r: Res | null) => r === null || (r.error !== null && !r.error.code && !missingRpc(r.error));
  let res: Res | null = await call().catch(() => null);
  if (lost(res) && live) res = await call().catch(() => null);
  if (res === null) throw new NoticeOutboxUnavailable("network");
  if (res.error) {
    if (missingRpc(res.error)) missing = true;
    throw new NoticeOutboxUnavailable(res.error.message ?? "error");
  }
  live = true;
  return res.data == null ? null : Number(res.data);
}

/** Undo: drops a still-pending notice. true = dropped (the patient won't hear of it). */
export async function cancelPatientNotice(db: SupabaseClient, id: number): Promise<boolean> {
  const { data, error } = await db.rpc("cancel_patient_notice", { p_id: id });
  if (error) throw error;
  return data === true;
}
